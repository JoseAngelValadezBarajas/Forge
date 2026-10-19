param()

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

Add-Type -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class ForgeDesktopWindowCapture
{
    [StructLayout(LayoutKind.Sequential)]
    private struct Rect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool GetWindowRect(IntPtr window, out Rect rect);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr window);

    public static void SaveWindow(IntPtr window, string filePath)
    {
        if (IsIconic(window))
            throw new InvalidOperationException("Forge window is minimized; refusing to save an empty screenshot.");
        Rect rect;
        if (!GetWindowRect(window, out rect))
            throw new InvalidOperationException("Could not read the Forge window bounds.");
        int width = rect.Right - rect.Left;
        int height = rect.Bottom - rect.Top;
        if (width <= 0 || height <= 0)
            throw new InvalidOperationException("Forge window has invalid screenshot dimensions.");

        using (var bitmap = new Bitmap(width, height))
        using (var graphics = Graphics.FromImage(bitmap))
        {
            graphics.CopyFromScreen(rect.Left, rect.Top, 0, 0, bitmap.Size);
            bitmap.Save(filePath, ImageFormat.Png);
        }
    }
}
"@ -ReferencedAssemblies @([System.Drawing.Bitmap].Assembly.Location)

function Get-ForgeWindow([int]$timeoutSeconds = 0) {
    $processId = [int]$env:FORGE_UIA_PROCESS_ID
    if ($processId -le 0) { throw "FORGE_UIA_PROCESS_ID must identify the installed Forge process." }
    $deadline = [DateTime]::UtcNow.AddSeconds($timeoutSeconds)
    do {
        $process = Get-Process -Id $processId -ErrorAction Stop
        if ($process.MainWindowHandle -ne [IntPtr]::Zero) {
            return [pscustomobject]@{
                Process = $process
                Handle = $process.MainWindowHandle
                Root = [System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
            }
        }
        if ($timeoutSeconds -le 0 -or [DateTime]::UtcNow -ge $deadline) { break }
        Start-Sleep -Milliseconds 200
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "Installed Forge process $processId does not have a main window."
}

function Get-ControlType {
    switch ($env:FORGE_UIA_CONTROL_TYPE) {
        "Button" { return [System.Windows.Automation.ControlType]::Button }
        "Edit" { return [System.Windows.Automation.ControlType]::Edit }
        "Hyperlink" { return [System.Windows.Automation.ControlType]::Hyperlink }
        "MenuItem" { return [System.Windows.Automation.ControlType]::MenuItem }
        "Text" { return [System.Windows.Automation.ControlType]::Text }
        "*" { return $null }
        default { throw "Unsupported UI Automation control type '$env:FORGE_UIA_CONTROL_TYPE'." }
    }
}

function Find-ForgeElement($root, [bool]$wait) {
    $name = $env:FORGE_UIA_NAME
    $controlType = Get-ControlType
    $matchMode = $env:FORGE_UIA_MATCH
    $timeout = [int]$env:FORGE_UIA_TIMEOUT_SECONDS
    if ($timeout -lt 1 -or $timeout -gt 180) { throw "UI Automation timeout must be between 1 and 180 seconds." }
    $deadline = [DateTime]::UtcNow.AddSeconds($timeout)
    do {
        try {
            $elements = $root.FindAll(
                [System.Windows.Automation.TreeScope]::Descendants,
                [System.Windows.Automation.Condition]::TrueCondition
            )
            foreach ($element in $elements) {
                try {
                    $current = $element.Current
                    if ($controlType -and $current.ControlType -ne $controlType) { continue }
                    $candidate = [string]$current.Name
                    $matches = if ($matchMode -eq "contains") {
                        $candidate.IndexOf($name, [StringComparison]::OrdinalIgnoreCase) -ge 0
                    } else {
                        [string]::Equals($candidate, $name, [StringComparison]::OrdinalIgnoreCase)
                    }
                    if ($matches) { return $element }
                } catch [System.Windows.Automation.ElementNotAvailableException] {
                    continue
                }
            }
        } catch [System.Windows.Automation.ElementNotAvailableException] {
            # The WebView may rebuild its accessibility subtree while React navigates.
        }
        if (-not $wait -or [DateTime]::UtcNow -ge $deadline) { break }
        Start-Sleep -Milliseconds 200
        $window = Get-ForgeWindow
        $root = $window.Root
    } while ([DateTime]::UtcNow -lt $deadline)
    return $null
}

function ConvertTo-SendKeysLiteral([string]$value) {
    $builder = [System.Text.StringBuilder]::new()
    foreach ($character in $value.ToCharArray()) {
        if ([string]$character -in @('+', '^', '%', '~', '(', ')', '{', '}', '[', ']')) {
            [void]$builder.Append('{')
            [void]$builder.Append($character)
            [void]$builder.Append('}')
        } else {
            [void]$builder.Append($character)
        }
    }
    return $builder.ToString()
}

function Invoke-ForgeFilePicker {
    $forgeWindow = Get-ForgeWindow
    $element = Find-ForgeElement $forgeWindow.Root $true
    if (-not $element) { throw "Could not find the file picker trigger named '$($env:FORGE_UIA_NAME)'." }
    $pattern = $null
    if ($element.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) {
        ([System.Windows.Automation.InvokePattern]$pattern).Invoke()
    } else {
        throw "File picker trigger '$($env:FORGE_UIA_NAME)' cannot be invoked."
    }
    $path = $env:FORGE_UIA_FILE_PATH
    if (-not $path) { throw "FORGE_UIA_FILE_PATH is required for file picker automation." }
    $deadline = [DateTime]::UtcNow.AddSeconds([int]$env:FORGE_UIA_TIMEOUT_SECONDS)
    do {
        $windowCondition = [System.Windows.Automation.PropertyCondition]::new(
            [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
            [System.Windows.Automation.ControlType]::Window
        )
        $windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll(
            [System.Windows.Automation.TreeScope]::Descendants,
            $windowCondition
        )
        foreach ($dialog in $windows) {
            try {
                $name = [string]$dialog.Current.Name
                if ($name -notmatch 'Open|Select|Choose|Upload') { continue }
                $editCondition = [System.Windows.Automation.PropertyCondition]::new(
                    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                    [System.Windows.Automation.ControlType]::Edit
                )
                $edits = $dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants, $editCondition)
                $fileNameEdit = $null
                foreach ($edit in $edits) {
                    $editName = [string]$edit.Current.Name
                    if ($editName -match 'File name|File name:|^Name$') {
                        try {
                            $candidatePattern = $edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
                            if (-not ([System.Windows.Automation.ValuePattern]$candidatePattern).Current.IsReadOnly) {
                                $fileNameEdit = $edit
                                break
                            }
                        } catch [System.Windows.Automation.ElementNotAvailableException] {
                            continue
                        }
                    }
                }
                $actionControls = $dialog.FindAll(
                    [System.Windows.Automation.TreeScope]::Descendants,
                    [System.Windows.Automation.Condition]::TrueCondition
                )
                foreach ($button in $actionControls) {
                    if ([string]$button.Current.Name -notmatch '^&?(Open|Choose|Select)$') { continue }
                    $buttonPattern = $null
                    if ($fileNameEdit -and $button.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$buttonPattern)) {
                        $valuePattern = $fileNameEdit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
                        ([System.Windows.Automation.ValuePattern]$valuePattern).SetValue($path)
                        ([System.Windows.Automation.InvokePattern]$buttonPattern).Invoke()
                        Write-Output "Selected file through the native Windows picker."
                        return
                    }
                }

                # Windows 11's common picker can expose the dialog as a Pane
                # without an actionable Open button or a named file-name edit.
                # Use its documented keyboard accelerators only after the
                # dialog was found through UI Automation; this keeps the smoke
                # test on the native picker without depending on localized or
                # virtualized control names.
                try {
                    $dialog.SetFocus()
                } catch [System.InvalidOperationException] {
                    # The native picker is already foreground after the
                    # trigger invocation, but its Window element can reject
                    # SetFocus on some hosted Windows runners.
                }
                Start-Sleep -Milliseconds 100
                [System.Windows.Forms.SendKeys]::SendWait('%n')
                Start-Sleep -Milliseconds 100
                [System.Windows.Forms.SendKeys]::SendWait((ConvertTo-SendKeysLiteral $path))
                Start-Sleep -Milliseconds 100
                [System.Windows.Forms.SendKeys]::SendWait('%o')
                Write-Output "Selected file through the native Windows picker keyboard fallback."
                return
            } catch [System.Windows.Automation.ElementNotAvailableException] {
                continue
            }
        }
        Start-Sleep -Milliseconds 200
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "Timed out waiting for the native Windows file picker."
}

function Get-ForgeAccessibilityTree($root, [int]$limit = 250) {
    $lines = [System.Collections.Generic.List[string]]::new()
    try {
        $elements = $root.FindAll(
            [System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition
        )
        foreach ($element in $elements) {
            if ($lines.Count -ge $limit) { break }
            try {
                $current = $element.Current
                if ($current.Name) {
                    $lines.Add("$($current.ControlType.ProgrammaticName): $($current.Name)")
                }
            } catch [System.Windows.Automation.ElementNotAvailableException] {
                continue
            }
        }
    } catch {
        $lines.Add("Could not read accessibility tree: $($_.Exception.Message)")
    }
    return $lines -join [Environment]::NewLine
}

try {
    $windowTimeout = if ($env:FORGE_UIA_ACTION -eq "wait") { [int]$env:FORGE_UIA_TIMEOUT_SECONDS } else { 0 }
    $window = Get-ForgeWindow $windowTimeout
    switch ($env:FORGE_UIA_ACTION) {
        "inspect" {
            Write-Output (Get-ForgeAccessibilityTree $window.Root)
        }
        "wait" {
            $element = Find-ForgeElement $window.Root $true
            if (-not $element) { throw "Timed out waiting for $($env:FORGE_UIA_CONTROL_TYPE) named '$($env:FORGE_UIA_NAME)'." }
            Write-Output "Found $($element.Current.ControlType.ProgrammaticName): $($element.Current.Name)"
        }
        "click" {
            $element = Find-ForgeElement $window.Root $true
            if (-not $element) { throw "Could not find $($env:FORGE_UIA_CONTROL_TYPE) named '$($env:FORGE_UIA_NAME)'." }
            $pattern = $null
            if ($element.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) {
                ([System.Windows.Automation.InvokePattern]$pattern).Invoke()
            } elseif ($element.TryGetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern, [ref]$pattern)) {
                $expandCollapse = [System.Windows.Automation.ExpandCollapsePattern]$pattern
                if ($expandCollapse.Current.ExpandCollapseState -eq [System.Windows.Automation.ExpandCollapseState]::Collapsed) {
                    $expandCollapse.Expand()
                } else {
                    $expandCollapse.Collapse()
                }
            } elseif ($element.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$pattern)) {
                ([System.Windows.Automation.TogglePattern]$pattern).Toggle()
            } elseif ($element.Current.ControlType -in @(
                [System.Windows.Automation.ControlType]::Button,
                [System.Windows.Automation.ControlType]::MenuItem,
                [System.Windows.Automation.ControlType]::Hyperlink
            )) {
                $element.SetFocus()
                [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
            } else {
                $supported = @($element.GetSupportedPatterns() | ForEach-Object { $_.ProgrammaticName }) -join ", "
                throw "Control '$($env:FORGE_UIA_NAME)' has no supported activation pattern. Available: $supported"
            }
            Write-Output "Invoked $($element.Current.ControlType.ProgrammaticName): $($element.Current.Name)"
        }
        "set-value" {
            $element = Find-ForgeElement $window.Root $true
            if (-not $element) { throw "Could not find editable control named '$($env:FORGE_UIA_NAME)'." }
            $pattern = $element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
            $valuePattern = [System.Windows.Automation.ValuePattern]$pattern
            if ($valuePattern.Current.IsReadOnly) { throw "Control '$($env:FORGE_UIA_NAME)' is read-only." }
            $valuePattern.SetValue($env:FORGE_UIA_VALUE)
            Write-Output "Set value on control '$($env:FORGE_UIA_NAME)'."
        }
        "choose-file" {
            Invoke-ForgeFilePicker
        }
        "screenshot" {
            $filePath = $env:FORGE_UIA_SCREENSHOT_PATH
            if (-not $filePath) { throw "A screenshot destination is required." }
            Start-Sleep -Milliseconds 150
            [ForgeDesktopWindowCapture]::SaveWindow($window.Handle, $filePath)
            Write-Output "Saved installed Forge window screenshot."
        }
        default { throw "Unsupported UI Automation action '$env:FORGE_UIA_ACTION'." }
    }
} catch {
    $details = $_.Exception.ToString()
    try {
        $window = Get-ForgeWindow
        $tree = Get-ForgeAccessibilityTree $window.Root
        if ($tree) { $details += [Environment]::NewLine + "Current Forge accessibility elements:" + [Environment]::NewLine + $tree }
    } catch {
        $details += [Environment]::NewLine + "Window diagnostics unavailable: $($_.Exception.Message)"
    }
    [Console]::Error.WriteLine($details)
    exit 1
}
