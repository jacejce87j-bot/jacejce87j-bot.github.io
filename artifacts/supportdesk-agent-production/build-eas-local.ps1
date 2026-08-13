Write-Host 'BUILD-DEBUG: START'
$env:EXPO_TOKEN = 'FtCpaxYyaF83FLbQCPS4GOmRYJnKxiAk9N_-QJNy'
Set-Location -LiteralPath 'C:\Users\lance\Downloads\ReplitExport-jacejce87j(1)\Zendesk-Salesforce\artifacts\supportdesk-agent-production'
$pnpm = 'C:\Users\lance\AppData\Roaming\npm\pnpm.cmd'
Write-Host 'BUILD-DEBUG: RUNNING EAS VERSION'
& $pnpm --dir 'C:\Users\lance\Downloads\ReplitExport-jacejce87j(1)\Zendesk-Salesforce\artifacts\supportdesk-agent-production' exec -- eas --version
Write-Host 'BUILD-DEBUG: EAS VERSION DONE'
Write-Host 'BUILD-DEBUG: RUNNING EAS BUILD'
& $pnpm --dir 'C:\Users\lance\Downloads\ReplitExport-jacejce87j(1)\Zendesk-Salesforce\artifacts\supportdesk-agent-production' exec -- eas build --platform android --profile preview --non-interactive
$lastExit = $LASTEXITCODE
Write-Host "BUILD-DEBUG: BUILD EXIT CODE = $lastExit"
Write-Host 'BUILD-DEBUG: END'
