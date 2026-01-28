# Complete Backend API Test Suite
# Tests all endpoints to ensure nothing is broken

$baseUrl = "http://localhost:5000"
$testResults = @()

function Test-Endpoint {
    param($name, $method, $url, $body, $token)
    
    Write-Host "`n=== Testing: $name ===" -ForegroundColor Cyan
    
    try {
        $headers = @{ "Content-Type" = "application/json" }
        if ($token) { $headers["Authorization"] = "Bearer $token" }
        
        $params = @{
            Uri = "$baseUrl$url"
            Method = $method
            Headers = $headers
            ErrorAction = "Stop"
        }
        
        if ($body) {
            $params["Body"] = ($body | ConvertTo-Json -Depth 10)
        }
        
        $response = Invoke-RestMethod @params
        Write-Host "✓ PASS" -ForegroundColor Green
        $script:testResults += [PSCustomObject]@{ Test = $name; Status = "PASS"; Error = $null }
        return $response
    }
    catch {
        $error = $_.Exception.Message
        Write-Host "✗ FAIL: $error" -ForegroundColor Red
        $script:testResults += [PSCustomObject]@{ Test = $name; Status = "FAIL"; Error = $error }
        return $null
    }
}

Write-Host "`n================================================" -ForegroundColor Yellow
Write-Host "  SUSTAINABLE CLASSROOM - API TEST SUITE" -ForegroundColor Yellow
Write-Host "================================================`n" -ForegroundColor Yellow

# 1. Health Check
Test-Endpoint "Health Check" "GET" "/api/health"

# 2. Admin Login
$adminLogin = Test-Endpoint "Admin Login" "POST" "/api/admin/login" @{
    email = "admin@classroom.local"
    password = "Admin@2026"
}
$adminToken = $adminLogin.token

if (-not $adminToken) {
    Write-Host "`n❌ CRITICAL: Admin login failed. Cannot proceed with protected endpoint tests." -ForegroundColor Red
    exit 1
}

# 3. Register Teacher
$teacherData = @{
    name = "Test Teacher $(Get-Random)"
    email = "teacher$(Get-Random)@test.com"
    password = "Test@123"
    staff_id = "STAFF$(Get-Random -Minimum 1000 -Maximum 9999)"
    dept = "Computer Science"
    media = @{}
}
Test-Endpoint "Register Teacher" "POST" "/api/admin/register-teacher" $teacherData $adminToken

# 4. Register Student  
$studentData = @{
    name = "Test Student $(Get-Random)"
    email = "student$(Get-Random)@test.com"
    password = "Test@123"
    reg_no = "REG$(Get-Random -Minimum 1000 -Maximum 9999)"
    class_dept = "CSE"
    section = "A"
    media = @{}
}
Test-Endpoint "Register Student" "POST" "/api/admin/register-student" $studentData $adminToken

# 5. Get All Teachers
Test-Endpoint "Get All Teachers" "GET" "/api/admin/teachers" $null $adminToken

# 6. Get All Students
Test-Endpoint "Get All Students" "GET" "/api/admin/students" $null $adminToken

# 7. Teacher Login (Step 1: Request OTP)
$teacherLoginStep1 = Test-Endpoint "Teacher Login (Request OTP)" "POST" "/api/login" @{
    email = $teacherData.email
    password = $teacherData.password
    role = "teacher"
}

# Get OTP from database for testing (wait briefly for it to be written)
Start-Sleep -Milliseconds 500
$teacherOtpRaw = docker exec -i lms-database psql -U lms_admin -d sustainable_classroom -t -A -c "SELECT otp_code FROM teachers WHERE email='$($teacherData.email)'" 2>&1
$teacherOtp = $teacherOtpRaw.ToString().Trim()
Write-Host "DEBUG: Teacher OTP retrieved: '$teacherOtp'" -ForegroundColor Yellow

# 7b. Teacher Login (Step 2: Verify OTP)
if ($teacherOtp -and $teacherOtp -ne "" -and $teacherOtp -notmatch "ERROR") {
    $teacherLogin = Test-Endpoint "Teacher Login (Verify OTP)" "POST" "/api/verify-otp" @{
        email = $teacherData.email
        otp = $teacherOtp
        role = "teacher"
    }
    $teacherToken = $teacherLogin.token
} else {
    Write-Host "✗ FAIL: Could not retrieve teacher OTP from database" -ForegroundColor Red
    $script:failedTests += "Teacher Login (Verify OTP): Could not retrieve OTP"
    $script:totalTests++
}

# 8. Student Login (Step 1: Request OTP)
Start-Sleep -Milliseconds 1000  # Avoid rate limiting
$studentLoginStep1 = Test-Endpoint "Student Login (Request OTP)" "POST" "/api/login" @{
    email = $studentData.email
    password = $studentData.password
    role = "student"
}

# Get OTP from database for testing (wait briefly for it to be written)
Start-Sleep -Milliseconds 500
$studentOtpRaw = docker exec -i lms-database psql -U lms_admin -d sustainable_classroom -t -A -c "SELECT otp_code FROM students WHERE email='$($studentData.email)'" 2>&1
$studentOtp = $studentOtpRaw.ToString().Trim()
Write-Host "DEBUG: Student OTP retrieved: '$studentOtp'" -ForegroundColor Yellow

# 8b. Student Login (Step 2: Verify OTP)
if ($studentOtp -and $studentOtp -ne "" -and $studentOtp -notmatch "ERROR") {
    $studentLogin = Test-Endpoint "Student Login (Verify OTP)" "POST" "/api/verify-otp" @{
        email = $studentData.email
        otp = $studentOtp
        role = "student"
    }
    $studentToken = $studentLogin.token
} else {
    Write-Host "✗ FAIL: Could not retrieve student OTP from database" -ForegroundColor Red
    $script:failedTests += "Student Login (Verify OTP): Could not retrieve OTP"
    $script:totalTests++
}

# 9. Get Student Profile
if ($studentToken) {
    Test-Endpoint "Get Student Profile" "GET" "/api/student/profile" $null $studentToken
}

# 10. Create Module (Teacher)
if ($teacherToken) {
    $moduleData = @{
        section = "CSE-A"
        subject = "Computer Science"
        topic = "Test Module $(Get-Random)"
        steps = @()
    }
    $module = Test-Endpoint "Create Module" "POST" "/api/teacher/upload-module" $moduleData $teacherToken
}

# 11. Get Teacher Modules
if ($teacherToken) {
    Test-Endpoint "Get Teacher Modules" "GET" "/api/teacher/modules/CSE-A" $null $teacherToken
}

# 13. Create MCQ Test (Teacher)
if ($teacherToken) {
    $testData = @{
        title = "Test MCQ $(Get-Random)"
        section = "CSE-A"
        duration_minutes = 30
        start_date = (Get-Date).ToString("yyyy-MM-dd")
        deadline = (Get-Date).AddDays(7).ToString("yyyy-MM-dd")
        questions = @(
            @{
                question_text = "Sample question?"
                options = @("A", "B", "C", "D")
                correct_answer = "A"
                marks = 1
            }
        )
    }
    Test-Endpoint "Create MCQ Test" "POST" "/api/teacher/test/create" $testData $teacherToken
}

# 13. Get Teacher Tests
if ($teacherToken) {
    Test-Endpoint "Get Teacher Tests" "GET" "/api/teacher/tests/CSE-A" $null $teacherToken
}

# 14. Get Student Tests
if ($studentToken) {
    Test-Endpoint "Get Student Tests" "GET" "/api/student/tests" $null $studentToken
}

# 15. Allocate Students to Teacher
if ($teacherLogin -and $studentLogin) {
    $allocationData = @{
        teacher_id = $teacherLogin.user.id
        student_ids = @($studentLogin.user.id)
        subject = "Computer Science"
    }
    Test-Endpoint "Allocate Students" "POST" "/api/admin/allocate" $allocationData $adminToken
}

# Print Summary
Write-Host "`n================================================" -ForegroundColor Yellow
Write-Host "  TEST RESULTS SUMMARY" -ForegroundColor Yellow
Write-Host "================================================`n" -ForegroundColor Yellow

$passed = ($testResults | Where-Object { $_.Status -eq "PASS" }).Count
$failed = ($testResults | Where-Object { $_.Status -eq "FAIL" }).Count
$total = $testResults.Count

Write-Host "Total Tests: $total" -ForegroundColor White
Write-Host "Passed: $passed" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })

if ($failed -gt 0) {
    Write-Host "`nFailed Tests:" -ForegroundColor Red
    $testResults | Where-Object { $_.Status -eq "FAIL" } | ForEach-Object {
        Write-Host "  ✗ $($_.Test): $($_.Error)" -ForegroundColor Red
    }
}

Write-Host "`n================================================`n" -ForegroundColor Yellow

if ($failed -eq 0) {
    Write-Host "✓ ALL TESTS PASSED!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "✗ SOME TESTS FAILED" -ForegroundColor Red
    exit 1
}
