param(
    [string]$BaseUrl = 'http://localhost:5000',
    [string]$AdminEmail = 'admin@classroom.local',
    [System.Security.SecureString]$AdminPassword = $null,
    [string]$StudentCsvPath = '',
    [string]$TeacherCsvPath = ''
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot

function Write-Step([string]$Message) { Write-Host "[SMOKE] $Message" -ForegroundColor Cyan }
function Write-Ok([string]$Message) { Write-Host "[OK] $Message" -ForegroundColor Green }
function Write-Warn([string]$Message) { Write-Host "[WARN] $Message" -ForegroundColor Yellow }

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) {
        throw $Message
    }
}

function ConvertTo-PlainText {
    param(
        [System.Security.SecureString]$SecureString
    )

    if (-not $SecureString) {
        return ''
    }

    $pointer = [System.IntPtr]::Zero
    try {
        $pointer = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureString)
        return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    } finally {
        if ($pointer -ne [System.IntPtr]::Zero) {
            [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        }
    }
}

function New-SecureStringFromPlainText {
    param(
        [string]$Text
    )

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return $null
    }

    return ConvertTo-SecureString -String $Text -AsPlainText -Force
}

function Invoke-SmokeRequest {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet('GET', 'POST', 'PUT', 'PATCH', 'DELETE')]
        [string]$Method,
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [object]$Body,
        [hashtable]$Headers = @{},
        [switch]$ExpectJson
    )

    $invokeParams = @{
        Uri = "$BaseUrl$Path"
        Method = $Method
        TimeoutSec = 30
        ErrorAction = 'Stop'
    }

    if ($Headers.Count -gt 0) {
        $invokeParams.Headers = $Headers
    }

    if ($PSBoundParameters.ContainsKey('Body')) {
        $invokeParams.ContentType = 'application/json'
        $invokeParams.Body = ($Body | ConvertTo-Json -Depth 20)
    }

    try {
        $response = Invoke-WebRequest @invokeParams
    } catch {
        $message = $null
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
            $message = $_.ErrorDetails.Message.Trim()
        }
        if (-not $message) {
            $message = $_.Exception.Message
        }
        throw "Request failed [$Method $Path]: $message"
    }

    $raw = ''
    if ($null -ne $response.Content) {
        $raw = [string]$response.Content
    }

    $json = $null
    $trimmed = $raw.Trim()
    if ($trimmed.Length -gt 0 -and ($ExpectJson -or $trimmed.StartsWith('{') -or $trimmed.StartsWith('['))) {
        try {
            $json = $trimmed | ConvertFrom-Json -Depth 20
        } catch {
            $json = $null
        }
    }

    [pscustomobject]@{
        StatusCode = [int]$response.StatusCode
        Raw = $raw
        Json = $json
    }
}

function Invoke-FileUpload {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$Endpoint,
        [Parameter(Mandatory = $true)]
        [string]$Token
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "CSV file not found: $Path"
    }

    $client = New-Object System.Net.Http.HttpClient
    $stream = $null
    $multipart = $null
    $fileContent = $null
    try {
        $client.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue('Bearer', $Token)
        $multipart = New-Object System.Net.Http.MultipartFormDataContent
        $stream = [System.IO.File]::OpenRead($Path)
        $fileContent = New-Object System.Net.Http.StreamContent($stream)
        $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse('text/csv')
        $multipart.Add($fileContent, 'file', [System.IO.Path]::GetFileName($Path))

        $response = $client.PostAsync("$BaseUrl$Endpoint", $multipart).GetAwaiter().GetResult()
        $responseBody = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()

        if (-not $response.IsSuccessStatusCode) {
            throw "HTTP $([int]$response.StatusCode): $responseBody"
        }

        $parsed = $null
        if ($responseBody.Trim().Length -gt 0) {
            try {
                $parsed = $responseBody | ConvertFrom-Json -Depth 20
            } catch {
                $parsed = $responseBody
            }
        }

        return $parsed
    } finally {
        if ($null -ne $fileContent) { $fileContent.Dispose() }
        if ($null -ne $multipart) { $multipart.Dispose() }
        if ($null -ne $stream) { $stream.Dispose() }
        $client.Dispose()
    }
}

function New-ScratchCsv {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Prefix,
        [Parameter(Mandatory = $true)]
        [string[]]$Lines
    )

    $tempDir = [System.IO.Path]::GetTempPath()
    $path = Join-Path $tempDir ("{0}-{1}.csv" -f $Prefix, [Guid]::NewGuid().ToString('N'))
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($path, ($Lines -join [Environment]::NewLine) + [Environment]::NewLine, $encoding)
    return $path
}

function Get-FirstCsvRow {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$Label
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "$Label CSV file not found: $Path"
    }

    $rows = @(Import-Csv -LiteralPath $Path)
    if ($rows.Count -eq 0) {
        throw "$Label CSV is empty: $Path"
    }

    return $rows[0]
}

function Get-TokenFromLogin {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Email,
        [Parameter(Mandatory = $true)]
        [System.Security.SecureString]$Password,
        [Parameter(Mandatory = $true)]
        [ValidateSet('admin', 'teacher', 'student')]
        [string]$Role
    )

    $path = if ($Role -eq 'admin') { '/api/admin/login' } else { '/api/login' }
    $body = @{ email = $Email; password = (ConvertTo-PlainText $Password) }
    if ($Role -ne 'admin') {
        $body.role = $Role
    }

    $response = Invoke-SmokeRequest -Method 'POST' -Path $path -Body $body -ExpectJson
    Assert-True ($response.StatusCode -eq 200) "Login for $Role failed with HTTP $($response.StatusCode)"
    Assert-True ($response.Json.success -eq $true) "Login for $Role was not successful"
    Assert-True (-not [string]::IsNullOrWhiteSpace([string]$response.Json.token)) "Login for $Role did not return a token"
    return [string]$response.Json.token
}

function Resolve-AdminPassword {
    $envPath = Join-Path $RepoRoot '.env'
    if (Test-Path -LiteralPath $envPath) {
        $line = Get-Content -LiteralPath $envPath | Where-Object { $_ -match '^ADMIN_PASSWORD=' } | Select-Object -First 1
        if ($line) {
            return ($line -split '=', 2)[1].Trim()
        }
    }

    throw "Admin password was not supplied and ADMIN_PASSWORD was not found in .env. Re-run with -AdminPassword."
}

$tempFiles = @()
$adminPasswordChanged = $false
$mainError = $null
$restoreError = $null
$temporaryAdminPassword = 'Smoke-' + [Guid]::NewGuid().ToString('N').Substring(0, 12)
$ResolvedAdminPassword = if ($AdminPassword) { ConvertTo-PlainText $AdminPassword } else { Resolve-AdminPassword }
$ResolvedAdminPasswordSecure = New-SecureStringFromPlainText $ResolvedAdminPassword
$TemporaryAdminPasswordSecure = New-SecureStringFromPlainText $temporaryAdminPassword

try {
    Write-Step "Checking health endpoints"
    $health = Invoke-SmokeRequest -Method 'GET' -Path '/api/health' -ExpectJson
    Assert-True ($health.StatusCode -eq 200) 'Health endpoint returned a non-200 status'
    Assert-True ($health.Json.status -eq 'ok') 'Health endpoint did not report ok'

    $detailedHealth = Invoke-SmokeRequest -Method 'GET' -Path '/api/health/detailed' -ExpectJson
    Assert-True ($detailedHealth.StatusCode -eq 200) 'Detailed health endpoint returned a non-200 status'
    Assert-True ($detailedHealth.Json.status -in @('ok', 'degraded')) 'Detailed health endpoint returned an unexpected status'
    Assert-True ($detailedHealth.Json.services.database.status -eq 'healthy') 'Database health was not healthy'
    Assert-True ($detailedHealth.Json.services.cache.status -eq 'healthy') 'Cache health was not healthy'

    $metrics = Invoke-SmokeRequest -Method 'GET' -Path '/api/metrics'
    Assert-True ($metrics.StatusCode -eq 200) 'Metrics endpoint returned a non-200 status'
    Assert-True ($metrics.Raw -match 'lms_http_requests_total') 'Metrics endpoint did not return Prometheus counters'
    Write-Ok 'Health, detailed health, and metrics endpoints are reachable.'

    Write-Step 'Logging in as admin'
    $adminToken = Get-TokenFromLogin -Email $AdminEmail -Password $ResolvedAdminPasswordSecure -Role 'admin'
    Write-Ok 'Admin login succeeded.'

    Write-Step 'Checking admin-only listing endpoint'
    $teacherList = Invoke-SmokeRequest -Method 'GET' -Path '/api/teachers' -Headers @{ Authorization = "Bearer $adminToken" } -ExpectJson
    Assert-True ($teacherList.StatusCode -eq 200) 'Teacher listing endpoint returned a non-200 status'
    Write-Ok ('Teacher list endpoint responded with {0} record(s).' -f @($teacherList.Json).Count)

    Write-Step 'Changing admin password to verify the newest endpoint'
    $changePassword = Invoke-SmokeRequest -Method 'POST' -Path '/api/admin/change-password' -Body @{ currentPassword = $ResolvedAdminPassword; newPassword = $temporaryAdminPassword } -ExpectJson
    Assert-True ($changePassword.StatusCode -eq 200) 'Admin password change returned a non-200 status'
    Assert-True ($changePassword.Json.success -eq $true) 'Admin password change did not succeed'
    $adminPasswordChanged = $true

    Write-Step 'Logging in with the temporary admin password'
    $tempAdminToken = Get-TokenFromLogin -Email $AdminEmail -Password $TemporaryAdminPasswordSecure -Role 'admin'
    Assert-True (-not [string]::IsNullOrWhiteSpace($tempAdminToken)) 'Temporary admin login failed'
    Write-Ok 'Temporary admin password works.'

    if (-not $StudentCsvPath) {
        $studentSuffix = [Guid]::NewGuid().ToString('N').Substring(0, 8)
        $StudentCsvPath = New-ScratchCsv -Prefix 'susclass-students' -Lines @(
            'name,email,password,reg_no,class_dept,section',
            "Smoke Student One,smoke.student.one.$studentSuffix@example.com,Student@1234,SMK001,Computer Science,A",
            "Smoke Student Two,smoke.student.two.$studentSuffix@example.com,Student@1234,SMK002,Computer Science,A"
        )
        $tempFiles += $StudentCsvPath
    }

    if (-not $TeacherCsvPath) {
        $teacherSuffix = [Guid]::NewGuid().ToString('N').Substring(0, 8)
        $TeacherCsvPath = New-ScratchCsv -Prefix 'susclass-teachers' -Lines @(
            'name,email,password,staff_id,dept',
            "Smoke Teacher One,smoke.teacher.one.$teacherSuffix@example.com,Teacher@1234,TEA001,CSE",
            "Smoke Teacher Two,smoke.teacher.two.$teacherSuffix@example.com,Teacher@1234,TEA002,Math"
        )
        $tempFiles += $TeacherCsvPath
    }

    $studentRow = Get-FirstCsvRow -Path $StudentCsvPath -Label 'Student'
    $teacherRow = Get-FirstCsvRow -Path $TeacherCsvPath -Label 'Teacher'

    Write-Step 'Testing bulk upload students'
    $studentUpload = Invoke-FileUpload -Path $StudentCsvPath -Endpoint '/api/admin/bulk-upload-students' -Token $adminToken
    Assert-True ($null -ne $studentUpload) 'Student upload did not return a response'
    Assert-True ($studentUpload.success -ge 1) 'Student bulk upload did not register any rows'
    Assert-True ($studentUpload.failed -eq 0) 'Student bulk upload reported failures'
    Write-Ok ("Student bulk upload registered {0} row(s)." -f $studentUpload.success)

    Write-Step 'Testing bulk upload teachers'
    $teacherUpload = Invoke-FileUpload -Path $TeacherCsvPath -Endpoint '/api/admin/bulk-upload-teachers' -Token $adminToken
    Assert-True ($null -ne $teacherUpload) 'Teacher upload did not return a response'
    Assert-True ($teacherUpload.success -ge 1) 'Teacher bulk upload did not register any rows'
    Assert-True ($teacherUpload.failed -eq 0) 'Teacher bulk upload reported failures'
    Write-Ok ("Teacher bulk upload registered {0} row(s)." -f $teacherUpload.success)

    $fullSection = ('{0} {1}' -f $studentRow.class_dept, $studentRow.section).Trim()
    $encodedSection = [System.Uri]::EscapeDataString($fullSection)
    $teacherEmail = [string]$teacherRow.email
    $teacherPassword = [string]$teacherRow.password
    $studentEmail = [string]$studentRow.email
    $studentPassword = [string]$studentRow.password

    Write-Step 'Logging in as the uploaded teacher'
    $teacherToken = Get-TokenFromLogin -Email $teacherEmail -Password (New-SecureStringFromPlainText $teacherPassword) -Role 'teacher'
    Write-Ok 'Teacher login succeeded.'

    Write-Step 'Creating an MCQ test'
    $testTitle = 'Smoke MCQ ' + (Get-Date -Format 'yyyyMMddHHmmss')
    $questions = @(
        @{ question = 'What is 2 + 2?'; options = @('1', '2', '4', '5'); correct = 'C' },
        @{ question = 'Largest planet?'; options = @('Earth', 'Mars', 'Jupiter', 'Venus'); correct = 'C' }
    )
    $createTest = Invoke-SmokeRequest -Method 'POST' -Path '/api/teacher/test/create' -Headers @{ Authorization = "Bearer $teacherToken" } -Body @{
        section = $fullSection
        sections = @($fullSection)
        title = $testTitle
        description = 'PowerShell smoke test'
        questions = $questions
        start_date = (Get-Date).AddMinutes(-5).ToString('o')
        deadline = (Get-Date).AddDays(1).ToString('o')
    } -ExpectJson
    Assert-True ($createTest.StatusCode -eq 201) 'MCQ test creation returned a non-201 status'
    Assert-True ($createTest.Json.success -eq $true) 'MCQ test creation did not succeed'
    $createdTestId = [string]$createTest.Json.test.id
    Assert-True (-not [string]::IsNullOrWhiteSpace($createdTestId)) 'MCQ test creation did not return a test id'
    Write-Ok "Created test $createdTestId for section $fullSection."

    Write-Step 'Verifying teacher test list'
    $teacherTests = Invoke-SmokeRequest -Method 'GET' -Path ("/api/teacher/tests/{0}" -f $encodedSection) -Headers @{ Authorization = "Bearer $teacherToken" } -ExpectJson
    Assert-True ($teacherTests.StatusCode -eq 200) 'Teacher tests endpoint returned a non-200 status'
    Assert-True (@($teacherTests.Json | Where-Object { $_.title -eq $testTitle }).Count -gt 0) 'Created test was not returned by the teacher tests endpoint'
    Write-Ok 'Teacher test listing includes the created MCQ.'

    Write-Step 'Logging in as the uploaded student'
    $studentToken = Get-TokenFromLogin -Email $studentEmail -Password (New-SecureStringFromPlainText $studentPassword) -Role 'student'
    Write-Ok 'Student login succeeded.'

    Write-Step 'Verifying student test list'
    $studentTests = Invoke-SmokeRequest -Method 'GET' -Path '/api/student/tests' -Headers @{ Authorization = "Bearer $studentToken" } -ExpectJson
    Assert-True ($studentTests.StatusCode -eq 200) 'Student tests endpoint returned a non-200 status'
    Assert-True (@($studentTests.Json | Where-Object { $_.title -eq $testTitle }).Count -gt 0) 'Created test was not returned by the student tests endpoint'
    Write-Ok 'Student test listing includes the created MCQ.'

    Write-Step 'Fetching the test details for the student'
    $studentTest = Invoke-SmokeRequest -Method 'GET' -Path ("/api/student/test/{0}" -f $createdTestId) -Headers @{ Authorization = "Bearer $studentToken" } -ExpectJson
    Assert-True ($studentTest.StatusCode -eq 200) 'Student test details endpoint returned a non-200 status'
    Assert-True ($studentTest.Json.title -eq $testTitle) 'Student test details did not return the created test'

    Write-Step 'Submitting the MCQ as the student'
    $submission = Invoke-SmokeRequest -Method 'POST' -Path '/api/student/test/submit' -Headers @{ Authorization = "Bearer $studentToken" } -Body @{
        test_id = [int]$createdTestId
        answers = @{ '0' = 'C'; '1' = 'C' }
        time_taken = 120
    } -ExpectJson
    Assert-True ($submission.StatusCode -eq 200) 'Student submission returned a non-200 status'
    Assert-True ($submission.Json.success -eq $true) 'Student submission did not succeed'
    Assert-True ([int]$submission.Json.submission.score -eq 2) 'Student submission score was not correct'
    Write-Ok 'Student submission succeeded and scored correctly.'

    Write-Step 'Checking teacher submissions for the MCQ'
    $submissions = Invoke-SmokeRequest -Method 'GET' -Path ("/api/teacher/test/{0}/submissions" -f $createdTestId) -Headers @{ Authorization = "Bearer $teacherToken" } -ExpectJson
    Assert-True ($submissions.StatusCode -eq 200) 'Teacher submissions endpoint returned a non-200 status'
    Assert-True (@($submissions.Json).Count -gt 0) 'Teacher submissions endpoint did not return the student submission'
    Write-Ok 'Teacher submissions endpoint shows the submitted MCQ.'

    Write-Step 'Restoring the admin password'
    $restore = Invoke-SmokeRequest -Method 'POST' -Path '/api/admin/change-password' -Body @{ currentPassword = $temporaryAdminPassword; newPassword = $ResolvedAdminPassword } -ExpectJson
    Assert-True ($restore.StatusCode -eq 200) 'Admin password restore returned a non-200 status'
    Assert-True ($restore.Json.success -eq $true) 'Admin password restore did not succeed'
    $adminPasswordChanged = $false

    Write-Step 'Confirming the original admin password works again'
    $restoredAdminToken = Get-TokenFromLogin -Email $AdminEmail -Password $ResolvedAdminPasswordSecure -Role 'admin'
    Assert-True (-not [string]::IsNullOrWhiteSpace($restoredAdminToken)) 'Admin login after restore failed'

    Write-Ok 'Smoke test completed successfully.'
} catch {
    $mainError = $_
} finally {
    if ($adminPasswordChanged) {
        try {
            $rollback = Invoke-SmokeRequest -Method 'POST' -Path '/api/admin/change-password' -Body @{ currentPassword = $temporaryAdminPassword; newPassword = $ResolvedAdminPassword } -ExpectJson
            if ($rollback.Json.success -eq $true) {
                Write-Warn 'Admin password restored during cleanup.'
                $adminPasswordChanged = $false
            } else {
                throw 'Admin password restore returned a non-success response.'
            }
        } catch {
            $restoreError = $_
        }
    }

    foreach ($tempFile in $tempFiles) {
        if ($tempFile -and (Test-Path -LiteralPath $tempFile)) {
            Remove-Item -LiteralPath $tempFile -Force -ErrorAction SilentlyContinue
        }
    }
}

if ($mainError -and $restoreError) {
    throw "Smoke test failed: $($mainError.Exception.Message) | Cleanup failed: $($restoreError.Exception.Message)"
}

if ($restoreError) {
    throw "Smoke test failed to restore the admin password: $($restoreError.Exception.Message)"
}

if ($mainError) {
    throw $mainError
}
