package global

import (
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

var configDir = (func() string {
	home, err := os.UserConfigDir()
	if err != nil {
		panic(err)
	}
	result := filepath.Join(home, "sst")
	os.Setenv("PATH", os.Getenv("PATH")+":"+result+"/bin")
	os.MkdirAll(result, 0755)
	return result
}())

func ConfigDir() string {
	return configDir
}

func NeedsPlugins() bool {
	files, err := os.ReadDir(filepath.Join(configDir, "plugins"))
	if err != nil {
		return true
	}
	slog.Info("plugins", "files", files)

	if len(files) == 0 {
		return true
	}

	return false
}

func InstallPlugins() error {
	slog.Info("installing plugins")
	cmd := exec.Command("pulumi", "plugin", "install", "resource", "aws")
	cmd.Env = append(os.Environ(), "PULUMI_HOME="+configDir)
	err := cmd.Run()
	if err != nil {
		return err
	}

	cmd = exec.Command("pulumi", "plugin", "install", "resource", "cloudflare")
	cmd.Env = append(os.Environ(), "PULUMI_HOME="+configDir)
	err = cmd.Run()
	if err != nil {
		return err
	}

	return nil
}

func NeedsPulumi() bool {
	home, err := os.UserHomeDir()
	if err != nil {
		panic(err)
	}
	os.Setenv("PATH", os.Getenv("PATH")+":"+home+"/.pulumi/bin")
	_, err = exec.LookPath("pulumi")
	if err != nil {
		return true
	}
	return false
}

func InstallPulumi() error {
	slog.Info("installing pulumi")
	if runtime.GOOS == "windows" {
		psCommand := `"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -InputFormat None -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; iex ((New-Object System.Net.WebClient).DownloadString('https://get.pulumi.com/install.ps1'))" && SET "PATH=%PATH%;%USERPROFILE%\.pulumi\bin"`
		_, err := exec.Command("cmd", "/C", psCommand).CombinedOutput()
		return err
	}

	cmd := `curl -fsSL https://get.pulumi.com | sh`
	_, err := exec.Command("bash", "-c", cmd).CombinedOutput()
	return err
}

func NeedsBun() bool {
	_, err := exec.LookPath("bun")
	if err != nil {
		return true
	}
	return false
}

func InstallBun() error {
	slog.Info("installing bun")
	cmd := exec.Command("bash", "-c", `curl -fsSL https://bun.sh/install | bash`)
	cmd.Env = append(os.Environ(), "BUN_INSTALL="+configDir)
	return cmd.Run()
}
