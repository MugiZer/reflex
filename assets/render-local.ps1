$env:MERMAID_PACKAGE_ROOT = 'C:\Users\moham\AppData\Local\npm-cache\_npx\668c188756b835f3\node_modules'
$env:CHROME_PATH = 'C:\Users\moham\AppData\Local\ms-playwright\chromium-1208\chrome-win64\chrome.exe'
node "$PSScriptRoot\render.cjs"
exit $LASTEXITCODE
