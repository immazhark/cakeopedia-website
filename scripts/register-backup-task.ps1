# Registers the daily encrypted backup in Windows Task Scheduler. NOTHING is created unless you pass -Register: by default this only prints the plan.
#   powershell -ExecutionPolicy Bypass -File scripts\register-backup-task.ps1                 (show the plan)
#   powershell -ExecutionPolicy Bypass -File scripts\register-backup-task.ps1 -Register       (create the task; needs the owner's go-ahead)
#   powershell -ExecutionPolicy Bypass -File scripts\register-backup-task.ps1 -Unregister     (remove it)
# The task runs as YOU (the same Windows user that holds the DPAPI-protected passphrase), only while you are logged on, from the build mirror folder (not OneDrive).
# Missed runs: StartWhenAvailable runs it after a missed schedule, and a second trigger fires 10 minutes after each logon; the script skips if a backup
# already succeeded in the last 20 hours, so catch-up never uploads twice.
param([switch]$Register, [switch]$Unregister, [string]$Source = 'production', [string]$Time = '03:00', [string]$WorkDir = (Join-Path $env:LOCALAPPDATA 'cakeopedia-build'))
$name = 'Cakeopedia encrypted backup'
$node = (Get-Command node -ErrorAction Stop).Source
if ($Unregister) { Unregister-ScheduledTask -TaskName $name -Confirm:$false; Write-Output "Removed task '$name'."; return }
if ($Source -notin 'production', 'staging') { throw 'Source must be production or staging.' }
if (-not (Test-Path (Join-Path $WorkDir 'scripts\backup-run.ts'))) { throw "Not found: $WorkDir\scripts\backup-run.ts. Run: node scripts/verify-clean.mjs (it refreshes the mirror)." }
$action = New-ScheduledTaskAction -Execute $node -Argument "scripts\backup-run.ts --source $Source" -WorkingDirectory $WorkDir
$daily = New-ScheduledTaskTrigger -Daily -At $Time
$logon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"; $logon.Delay = 'PT10M'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 30) -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Write-Output "Plan: '$name' runs '$node scripts\backup-run.ts --source $Source' in $WorkDir daily at $Time and 10 minutes after logon, as $env:USERDOMAIN\$env:USERNAME (only while logged on), catch-up on, 3 retries 30 minutes apart, 30 minute limit."
if (-not $Register) { Write-Output 'Dry run only: nothing was created. Add -Register to create it.'; return }
Register-ScheduledTask -TaskName $name -Action $action -Trigger @($daily, $logon) -Settings $settings -Principal $principal -Description 'Encrypted D1 backup to Backblaze B2 (Cakeopedia). See docs/operations-runbook.md.' | Out-Null
Write-Output "Created task '$name'. Check it with: node scripts\backup-run.ts --status"
