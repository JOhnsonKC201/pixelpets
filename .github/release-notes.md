### Install

**Windows:** run `pixelpets-Setup-*.exe`. SmartScreen will show a blue
"Windows protected your PC" screen because the build is not code-signed
(a certificate costs real money for a free app). Click **More info**,
then **Run anyway**.

**macOS:** open the `.dmg`, drag the app to Applications, then open it
once and allow it in **System Settings > Privacy & Security >
Open Anyway**. A double-click will be refused by Gatekeeper first time,
for the same reason. (macOS 14 and earlier: right-click > Open works too.)

Prefer not to? [Play it in your browser](https://pixelcat-jet.vercel.app)
or run it from source: `npm install && npm start`.

### Check your download

Each platform has a `SHA256SUMS-*.txt` next to its files. On macOS or Linux run
`shasum -a 256 -c SHA256SUMS-macos.txt` in the download folder; on Windows,
`Get-FileHash pixelpets-Setup-*.exe` in PowerShell and compare with the line in
`SHA256SUMS-windows.txt`.

The keyboard hook forwards a single "a key was pressed" boolean and never
what you typed. See [SECURITY.md](https://github.com/JOhnsonKC201/pixelpets/blob/main/SECURITY.md).
