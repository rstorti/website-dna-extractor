$Exclude = @("node_modules", ".git", ".data", "outputs", "WebsiteDNA_SourceCode_For_Lovable.zip", "WebsiteDNA_SourceCode.zip")
$Files = Get-ChildItem -Path . -Exclude $Exclude -Recurse | Where-Object { $_.FullName -notmatch '\\node_modules\\' -and $_.FullName -notmatch '\\\.git\\' -and $_.FullName -notmatch '\\\.data\\' -and $_.FullName -notmatch '\\outputs\\' }
Compress-Archive -Path $Files.FullName -DestinationPath "WebsiteDNA_SourceCode.zip" -Force
