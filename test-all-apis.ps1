# Complete Backend API Test Suite
# Tests ALL ~90 endpoints to ensure nothing is broken
# Login is direct JWT (no email OTP) — TOTP authenticator is optional
# Usage: .\test-all-apis.ps1

$baseUrl = "http://localhost:5000"
$testResults = @()

function Test-Endpoint {
    param($name, $method, $url, $body, $token, [switch]$expectFail)
    
    Write-Host "`n--- Testing: $name ---" -ForegroundColor Cyan
    Write-Host "  $method $url" -ForegroundColor DarkGray
    
    try {
        $headers = @{ "Content-Type" = "application/json" }
        if ($token) { $headers["Authorization"] = "Bearer $token" }
        
        $params = @{
            Uri = "$baseUrl$url"
            Method = $method
            Headers = $headers
            ErrorAction = "Stop"
            TimeoutSec = 15
        }
        
        if ($body) {
            $params["Body"] = ($body | ConvertTo-Json -Depth 10)
        }
        
        $response = Invoke-RestMethod @params
        
        if ($expectFail) {
            Write-Host "  ? UNEXPECTED PASS (expected failure)" -ForegroundColor Yellow
            $script:testResults += [PSCustomObject]@{ Test = $name; Status = "WARN"; Error = "Expected failure but passed" }
        } else {
            Write-Host "  PASS" -ForegroundColor Green
            $script:testResults += [PSCustomObject]@{ Test = $name; Status = "PASS"; Error = $null }
        }
        return $response
    }
    catch {
        $statusCode = $_.Exception.Response.StatusCode.Value__
        $error = $_.Exception.Message
        
        if ($expectFail) {
            Write-Host "  PASS (expected $statusCode)" -ForegroundColor Green
            $script:testResults += [PSCustomObject]@{ Test = $name; Status = "PASS"; Error = $null }
        } else {
            Write-Host "  FAIL ($statusCode): $error" -ForegroundColor Red
            $script:testResults += [PSCustomObject]@{ Test = $name; Status = "FAIL"; Error = "$statusCode - $error" }
        }
        return $null
    }
}

Write-Host "`n======================================================" -ForegroundColor Yellow
Write-Host "  SUSTAINABLE CLASSROOM - COMPREHENSIVE API TEST SUITE" -ForegroundColor Yellow
Write-Host "  Testing ~90 endpoints" -ForegroundColor Yellow
Write-Host "======================================================`n" -ForegroundColor Yellow

# ==========================================
# SECTION 1: Health & System Endpoints
# ==========================================
Write-Host "`n[SECTION 1] Health & System" -ForegroundColor Magenta
Test-Endpoint "Health Check" "GET" "/api/health"
Test-Endpoint "Health Detailed" "GET" "/api/health/detailed"
Test-Endpoint "Metrics" "GET" "/api/metrics"

# ==========================================
# SECTION 2: Admin Login
# ==========================================
Write-Host "`n[SECTION 2] Admin Auth" -ForegroundColor Magenta
$adminLogin = Test-Endpoint "Admin Login" "POST" "/api/admin/login" @{
    email = "admin@classroom.local"
    password = "Admin@2026"
}
$adminToken = $adminLogin.token

Test-Endpoint "Admin Login - Bad Password" "POST" "/api/admin/login" @{
    email = "admin@classroom.local"
    password = "wrong"
} -expectFail

if (-not $adminToken) {
    Write-Host "`nCRITICAL: Admin login failed. Cannot continue." -ForegroundColor Red
    exit 1
}

# ==========================================
# SECTION 3: Admin Registration
# ==========================================
Write-Host "`n[SECTION 3] Admin Registration" -ForegroundColor Magenta
$rand = Get-Random -Minimum 10000 -Maximum 99999
$teacherEmail = "testteacher${rand}@test.com"
$studentEmail = "teststudent${rand}@test.com"

$teacherReg = Test-Endpoint "Register Teacher" "POST" "/api/admin/register-teacher" @{
    name = "Test Teacher $rand"
    email = $teacherEmail
    password = "Test@123456"
    staff_id = "STAFF$rand"
    dept = "Computer Science"
    media = @{}
} $adminToken

$studentReg = Test-Endpoint "Register Student" "POST" "/api/admin/register-student" @{
    name = "Test Student $rand"
    email = $studentEmail
    password = "Test@123456"
    reg_no = "REG$rand"
    class_dept = "CSE"
    section = "A"
    media = @{}
} $adminToken

# ==========================================
# SECTION 4: Admin Management
# ==========================================
Write-Host "`n[SECTION 4] Admin Management" -ForegroundColor Magenta
$allTeachers = Test-Endpoint "Get All Teachers" "GET" "/api/admin/teachers" $null $adminToken
$allStudents = Test-Endpoint "Get All Students" "GET" "/api/admin/students" $null $adminToken
Test-Endpoint "Get System Status" "GET" "/api/admin/system-status" $null $adminToken
Test-Endpoint "Get Sections" "GET" "/api/admin/sections" $null $adminToken

# Get IDs from registration or from list
$teacherId = $null
$studentId = $null

if ($allTeachers) {
    $foundTeacher = $allTeachers | Where-Object { $_.email -eq $teacherEmail } | Select-Object -First 1
    if ($foundTeacher) { $teacherId = $foundTeacher.id }
}
if ($allStudents) {
    $foundStudent = $allStudents | Where-Object { $_.email -eq $studentEmail } | Select-Object -First 1
    if ($foundStudent) { $studentId = $foundStudent.id }
}

Write-Host "  Teacher ID: $teacherId, Student ID: $studentId" -ForegroundColor DarkGray

# Update Teacher
if ($teacherId) {
    Test-Endpoint "Update Teacher" "PUT" "/api/admin/teacher/$teacherId" @{
        name = "Updated Teacher $rand"
        email = $teacherEmail
        staff_id = "STAFF$rand"
        dept = "Computer Science"
    } $adminToken
}

# Update Student
if ($studentId) {
    Test-Endpoint "Update Student" "PUT" "/api/admin/student/$studentId" @{
        name = "Updated Student $rand"
        email = $studentEmail
        reg_no = "REG$rand"
        class_dept = "CSE"
        section = "A"
    } $adminToken
}

# ==========================================
# SECTION 5: Admin Allocation
# ==========================================
Write-Host "`n[SECTION 5] Admin Allocation" -ForegroundColor Magenta
if ($teacherId -and $studentId) {
    Test-Endpoint "Allocate Students to Teacher" "POST" "/api/admin/allocate" @{
        teacher_id = $teacherId
        student_ids = @($studentId)
        subject = "Computer Science"
    } $adminToken

    Test-Endpoint "Allocate Sections" "POST" "/api/admin/allocate-sections" @{
        teacher_id = $teacherId
        sections = @(1)
        subject = "Computer Science"
    } $adminToken

    Test-Endpoint "Get Teacher Students" "GET" "/api/admin/teacher/$teacherId/students" $null $adminToken
    Test-Endpoint "Get Student Teachers" "GET" "/api/admin/student/$studentId/teachers" $null $adminToken
    
    Test-Endpoint "Update Teacher Allocations" "PUT" "/api/admin/teacher/$teacherId/allocations" @{
        sections = @("CSE A")
        subject = "Computer Science"
    } $adminToken
}

# Admin Reset Password
if ($studentId) {
    Test-Endpoint "Admin Reset Password" "POST" "/api/admin/reset-password" @{
        userId = $studentId
        userType = "student"
        newPassword = "NewPass@123456"
    } $adminToken
}

# ==========================================
# SECTION 6: Teacher Login (Direct - OTP disabled)
# ==========================================
Write-Host "`n[SECTION 6] Teacher Auth" -ForegroundColor Magenta
$teacherLogin = Test-Endpoint "Teacher Login" "POST" "/api/login" @{
    email = $teacherEmail
    password = "Test@123456"
    role = "teacher"
}

# Handle both direct login (mfaRequired=false) and OTP flow
$teacherToken = $null
if ($teacherLogin.token) {
    $teacherToken = $teacherLogin.token
    Write-Host "  Direct login OK" -ForegroundColor DarkGray
} else {
    Write-Host "  Login returned no token" -ForegroundColor Yellow
}

# ==========================================
# SECTION 7: Student Login (Direct - OTP disabled)
# ==========================================
Write-Host "`n[SECTION 7] Student Auth" -ForegroundColor Magenta

# Student password was reset to NewPass@123456 above
$studentLogin = Test-Endpoint "Student Login" "POST" "/api/login" @{
    email = $studentEmail
    password = "NewPass@123456"
    role = "student"
}

$studentToken = $null
if ($studentLogin.token) {
    $studentToken = $studentLogin.token
    Write-Host "  Direct login OK" -ForegroundColor DarkGray
} else {
    Write-Host "  Login returned no token" -ForegroundColor Yellow
}

# Login validation tests
Test-Endpoint "Login - Bad Password" "POST" "/api/login" @{
    email = $studentEmail
    password = "wrongpassword"
    role = "student"
} -expectFail

Test-Endpoint "Login - Missing Fields" "POST" "/api/login" @{} -expectFail

# ==========================================
# SECTION 8: TOTP / MFA Endpoints
# ==========================================
Write-Host "`n[SECTION 8] TOTP/MFA" -ForegroundColor Magenta
if ($teacherToken) {
    Test-Endpoint "Check TOTP Status" "GET" "/api/check-totp" $null $teacherToken
    # Setup TOTP (just test the endpoint responds)
    $totpSetup = Test-Endpoint "Setup TOTP" "POST" "/api/setup-totp" $null $teacherToken
}

# Password Reset Request (fire-and-forget email)
Test-Endpoint "Password Reset Request" "POST" "/api/password-reset/request" @{
    email = $studentEmail
    role = "student"
}

# ==========================================
# SECTION 9: Teacher Profile & Students
# ==========================================
Write-Host "`n[SECTION 9] Teacher Profile & Students" -ForegroundColor Magenta
if ($teacherToken) {
    Test-Endpoint "Teacher Profile" "GET" "/api/teacher/me" $null $teacherToken
    Test-Endpoint "Teacher My Students" "GET" "/api/teacher/my-students" $null $teacherToken
    Test-Endpoint "Teacher Students by Section" "GET" "/api/teacher/students/CSE%20A" $null $teacherToken
}

# ==========================================
# SECTION 10: Module CRUD (Teacher)
# ==========================================
Write-Host "`n[SECTION 10] Module CRUD" -ForegroundColor Magenta
$moduleId = $null
if ($teacherToken) {
    $moduleCreate = Test-Endpoint "Create Module" "POST" "/api/teacher/upload-module" @{
        section = "CSE A"
        subject = "Computer Science"
        topic = "Test Module $rand"
        steps = @(
            @{ type = "text"; header = "Introduction"; data = "This is step 1" },
            @{ type = "text"; header = "Details"; data = "This is step 2" },
            @{ type = "mcq"; header = "Quiz"; data = @{ question = "What is 1+1?"; a = "1"; b = "2"; c = "3"; d = "4"; correct = "B" } }
        )
    } $teacherToken
    
    if ($moduleCreate.id) {
        $moduleId = $moduleCreate.id
    } elseif ($moduleCreate.moduleId) {
        $moduleId = $moduleCreate.moduleId
    }
    
    Write-Host "  Module ID: $moduleId" -ForegroundColor DarkGray
    
    Test-Endpoint "Get Teacher Modules (section)" "GET" "/api/teacher/modules/CSE%20A" $null $teacherToken
    Test-Endpoint "Get Teacher My Modules" "GET" "/api/teacher/my-modules" $null $teacherToken
    
    if ($moduleId) {
        Test-Endpoint "Get Module Detail" "GET" "/api/teacher/module/$moduleId" $null $teacherToken
        
        Test-Endpoint "Update Module" "PUT" "/api/teacher/module/$moduleId" @{
            section = "CSE A"
            subject = "Computer Science"
            topic = "Updated Module $rand"
            steps = @(
                @{ type = "text"; header = "Updated Intro"; data = "Updated step 1" },
                @{ type = "text"; header = "Updated Details"; data = "Updated step 2" }
            )
        } $teacherToken
        
        Test-Endpoint "Update Module Section" "PUT" "/api/teacher/module/$moduleId/section" @{
            sections = @("CSE A")
        } $teacherToken
        
        Test-Endpoint "Module Statistics" "GET" "/api/teacher/module/$moduleId/statistics" $null $teacherToken
        Test-Endpoint "Module Coding Submissions" "GET" "/api/teacher/module/$moduleId/coding-submissions" $null $teacherToken
    }
    
    Test-Endpoint "Teacher Coding Submissions" "GET" "/api/teacher/coding-submissions" $null $teacherToken
}

# ==========================================
# SECTION 11: Student Modules
# ==========================================
Write-Host "`n[SECTION 11] Student Modules" -ForegroundColor Magenta
if ($studentToken) {
    Test-Endpoint "Student Profile" "GET" "/api/student/profile" $null $studentToken
    Test-Endpoint "Student My Modules" "GET" "/api/student/my-modules" $null $studentToken
    Test-Endpoint "Student Recent Modules" "GET" "/api/student/recent-modules" $null $studentToken
    Test-Endpoint "Student Stats" "GET" "/api/student/stats" $null $studentToken
    Test-Endpoint "Student Module Progress" "GET" "/api/student/module-progress" $null $studentToken
    Test-Endpoint "Student Daily Time" "GET" "/api/student/daily-time" $null $studentToken
    
    if ($moduleId) {
        Test-Endpoint "Student View Module" "GET" "/api/student/module/$moduleId" $null $studentToken
        
        Test-Endpoint "Student Complete Step" "POST" "/api/student/module/$moduleId/complete" @{
            stepIndex = 0
        } $studentToken
    }
    
    Test-Endpoint "Student Start Session" "POST" "/api/student/start-session" @{
        moduleId = $(if ($moduleId) { $moduleId } else { 1 })
    } $studentToken
    
    Test-Endpoint "Student Update Time" "POST" "/api/student/update-time" @{
        seconds = 60
    } $studentToken
}

# ==========================================
# SECTION 12: MCQ Tests (Teacher)
# ==========================================
Write-Host "`n[SECTION 12] MCQ Tests" -ForegroundColor Magenta
$testId = $null
if ($teacherToken) {
    $testCreate = Test-Endpoint "Create MCQ Test" "POST" "/api/teacher/test/create" @{
        title = "API Test Quiz $rand"
        description = "Automated test quiz"
        section = "CSE A"
        sections = @("CSE A")
        start_date = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
        deadline = (Get-Date).AddDays(7).ToString("yyyy-MM-ddTHH:mm:ss")
        questions = @(
            @{ question = "What is 1+1?"; a = "1"; b = "2"; c = "3"; d = "4"; correct = "B" },
            @{ question = "What is 2+2?"; a = "3"; b = "4"; c = "5"; d = "6"; correct = "B" },
            @{ question = "What is 3+3?"; a = "5"; b = "6"; c = "7"; d = "8"; correct = "B" },
            @{ question = "What is 4+4?"; a = "7"; b = "8"; c = "9"; d = "10"; correct = "B" },
            @{ question = "What is 5+5?"; a = "9"; b = "10"; c = "11"; d = "12"; correct = "B" }
        )
    } $teacherToken
    
    if ($testCreate.testId) { $testId = $testCreate.testId }
    elseif ($testCreate.test_id) { $testId = $testCreate.test_id }
    elseif ($testCreate.id) { $testId = $testCreate.id }
    
    Write-Host "  Test ID: $testId" -ForegroundColor DarkGray
    
    Test-Endpoint "Get Teacher Tests" "GET" "/api/teacher/tests/CSE%20A" $null $teacherToken
    
    if ($testId) {
        Test-Endpoint "Get Test Submissions" "GET" "/api/teacher/test/$testId/submissions" $null $teacherToken
        
        Test-Endpoint "Update Test" "PUT" "/api/teacher/test/$testId" @{
            title = "Updated Quiz $rand"
            deadline = (Get-Date).AddDays(14).ToString("yyyy-MM-ddTHH:mm:ss")
        } $teacherToken
        
        Test-Endpoint "Update Test Sections" "PUT" "/api/teacher/test/$testId/section" @{
            sections = @("CSE A")
        } $teacherToken
    }
}

# ==========================================
# SECTION 13: Student Tests
# ==========================================
Write-Host "`n[SECTION 13] Student Tests" -ForegroundColor Magenta
if ($studentToken) {
    Test-Endpoint "Student Get Tests" "GET" "/api/student/tests" $null $studentToken
    Test-Endpoint "Student Progress" "GET" "/api/student/progress" $null $studentToken
    
    if ($testId) {
        Test-Endpoint "Student View Test" "GET" "/api/student/test/$testId" $null $studentToken
        
        Test-Endpoint "Student Submit Test" "POST" "/api/student/test/submit" @{
            test_id = $testId
            answers = @{ "1" = "B"; "2" = "B"; "3" = "B"; "4" = "B"; "5" = "B" }
        } $studentToken
    }
}

# ==========================================
# SECTION 14: Teacher Student Progress
# ==========================================
Write-Host "`n[SECTION 14] Teacher Student Progress" -ForegroundColor Magenta
if ($teacherToken -and $studentId) {
    Test-Endpoint "Teacher View Student Progress" "GET" "/api/teacher/student/$studentId/progress" $null $teacherToken
    Test-Endpoint "Teacher View Student Module Progress" "GET" "/api/teacher/student/$studentId/module-progress" $null $teacherToken
}

# ==========================================
# SECTION 15: Code Execution
# ==========================================
Write-Host "`n[SECTION 15] Code Execution" -ForegroundColor Magenta
if ($studentToken) {
    Test-Endpoint "Execute Code" "POST" "/api/student/execute-code" @{
        code = "print('hello')"
        language = "python"
        stdin = ""
    } $studentToken
    
    Test-Endpoint "Submit Code" "POST" "/api/student/submit-code" @{
        moduleId = $(if ($moduleId) { $moduleId } else { 1 })
        code = "print('hello')"
        language = "python"
        testCases = @(@{ input = ""; expected = "hello" })
    } $studentToken
}

# ==========================================
# SECTION 16: Notifications
# ==========================================
Write-Host "`n[SECTION 16] Notifications" -ForegroundColor Magenta
if ($studentToken) {
    Test-Endpoint "Notification Inbox" "GET" "/api/notifications/inbox" $null $studentToken
    Test-Endpoint "Notification Unread Count" "GET" "/api/notifications/unread-count" $null $studentToken
    Test-Endpoint "Notification Preferences" "GET" "/api/notifications/preferences" $null $studentToken
    Test-Endpoint "Notification History" "GET" "/api/notifications/history" $null $studentToken
    Test-Endpoint "Mark All Notifications Read" "PATCH" "/api/notifications/read-all" $null $studentToken
}
if ($teacherToken) {
    Test-Endpoint "Notification Stats (Teacher)" "GET" "/api/notifications/stats" $null $teacherToken
    Test-Endpoint "Test Notification" "POST" "/api/notifications/test" @{
        eventCode = "MODULE_PUBLISHED"
        data = @{ title = "API Test Module" }
    } $teacherToken
}

# ==========================================
# SECTION 17: Live Sessions
# ==========================================
Write-Host "`n[SECTION 17] Live Sessions" -ForegroundColor Magenta
if ($studentToken) {
    Test-Endpoint "Student Live Sessions" "GET" "/api/student/live-sessions" $null $studentToken
}
if ($teacherToken) {
    Test-Endpoint "Teacher Live Sessions" "GET" "/api/teacher/live-sessions" $null $teacherToken
}

# ==========================================
# SECTION 18: Chat
# ==========================================
Write-Host "`n[SECTION 18] Chat" -ForegroundColor Magenta
if ($teacherToken) {
    Test-Endpoint "Available Chat Users" "GET" "/api/chat/available-users" $null $teacherToken
    Test-Endpoint "Chat Rooms" "GET" "/api/chat/rooms" $null $teacherToken
    
    # Create a chat room
    if ($studentId) {
        $chatRoom = Test-Endpoint "Create Chat Room" "POST" "/api/chat/room" @{
            targetId = $studentId
            targetRole = "student"
        } $teacherToken
        
        $roomId = $null
        if ($chatRoom.roomId) { $roomId = $chatRoom.roomId }
        elseif ($chatRoom.room_id) { $roomId = $chatRoom.room_id }
        elseif ($chatRoom.id) { $roomId = $chatRoom.id }
        
        if ($roomId) {
            Test-Endpoint "Get Chat Messages" "GET" "/api/chat/rooms/$roomId/messages" $null $teacherToken
            Test-Endpoint "Send Chat Message" "POST" "/api/chat/rooms/$roomId/messages" @{
                message = "Hello from API test"
            } $teacherToken
        }
    }
}

# ==========================================
# SECTION 19: Storage (Admin)
# ==========================================
Write-Host "`n[SECTION 19] Storage" -ForegroundColor Magenta
Test-Endpoint "Storage Stats" "GET" "/api/storage/stats" $null $adminToken
Test-Endpoint "Storage Files (images)" "GET" "/api/storage/files/images" $null $adminToken
Test-Endpoint "Storage Files (videos)" "GET" "/api/storage/files/videos" $null $adminToken
Test-Endpoint "Storage Files (documents)" "GET" "/api/storage/files/documents" $null $adminToken

# ==========================================
# SECTION 20: Security Tests
# ==========================================
Write-Host "`n[SECTION 20] Security Tests" -ForegroundColor Magenta
Test-Endpoint "Unauthorized Access - No Token" "GET" "/api/student/profile" -expectFail
Test-Endpoint "Unauthorized Access - Bad Token" "GET" "/api/student/profile" $null "invalidtoken123" -expectFail
Test-Endpoint "Admin-Only as Student" "GET" "/api/admin/teachers" $null $studentToken -expectFail
Test-Endpoint "Admin-Only as Teacher" "GET" "/api/admin/teachers" $null $teacherToken -expectFail

# ==========================================
# SECTION 21: Cleanup (Delete test data)
# ==========================================
Write-Host "`n[SECTION 21] Cleanup" -ForegroundColor Magenta
if ($testId) {
    Test-Endpoint "Delete Test" "DELETE" "/api/teacher/test/$testId" $null $teacherToken
}
if ($moduleId) {
    Test-Endpoint "Delete Module" "DELETE" "/api/teacher/module/$moduleId" $null $teacherToken
}
if ($teacherId) {
    # Delete allocation first
    Test-Endpoint "Delete Teacher Section" "DELETE" "/api/admin/teacher/$teacherId/section/CSE%20A" $null $adminToken
    Test-Endpoint "Delete Teacher" "DELETE" "/api/admin/teacher/$teacherId" $null $adminToken
}
if ($studentId) {
    Test-Endpoint "Delete Student" "DELETE" "/api/admin/student/$studentId" $null $adminToken
}

# ==========================================
# RESULTS SUMMARY
# ==========================================
Write-Host "`n======================================================" -ForegroundColor Yellow
Write-Host "  TEST RESULTS SUMMARY" -ForegroundColor Yellow
Write-Host "======================================================`n" -ForegroundColor Yellow

$passed = ($testResults | Where-Object { $_.Status -eq "PASS" }).Count
$failed = ($testResults | Where-Object { $_.Status -eq "FAIL" }).Count
$warned = ($testResults | Where-Object { $_.Status -eq "WARN" }).Count
$total = $testResults.Count

Write-Host "Total Tests: $total" -ForegroundColor White
Write-Host "Passed:  $passed" -ForegroundColor Green
if ($warned -gt 0) { Write-Host "Warnings: $warned" -ForegroundColor Yellow }
Write-Host "Failed:  $failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })

if ($failed -gt 0) {
    Write-Host "`nFailed Tests:" -ForegroundColor Red
    $testResults | Where-Object { $_.Status -eq "FAIL" } | ForEach-Object {
        Write-Host "  x $($_.Test): $($_.Error)" -ForegroundColor Red
    }
}

Write-Host "`n======================================================" -ForegroundColor Yellow

# Table output
Write-Host "`nDetailed Results:" -ForegroundColor Cyan
$testResults | Format-Table -Property Test, Status, Error -AutoSize -Wrap

if ($failed -eq 0) {
    Write-Host "ALL TESTS PASSED! Safe to deploy." -ForegroundColor Green
    exit 0
} else {
    Write-Host "$failed TESTS FAILED - Review before deploying." -ForegroundColor Red
    exit 1
}
