package main

import (
	"bufio"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/briandowns/spinner"
	"github.com/fatih/color"
	"github.com/manifoldco/promptui"
	"github.com/sst/ion/internal/util"
	"github.com/sst/ion/pkg/project"
)

func CmdInit(cli *Cli) error {
	if _, err := os.Stat("sst.config.ts"); err == nil {
		color.New(color.FgRed, color.Bold).Print("×")
		color.New(color.FgWhite, color.Bold).Println(" SST project already exists")
		return nil
	}

	logo := []string{
		``,
		`   ███████╗███████╗████████╗`,
		`   ██╔════╝██╔════╝╚══██╔══╝`,
		`   ███████╗███████╗   ██║   `,
		`   ╚════██║╚════██║   ██║   `,
		`   ███████║███████║   ██║   `,
		`   ╚══════╝╚══════╝   ╚═╝   `,
		``,
	}

	fmt.Print("\033[?25l")
	for _, line := range logo {
		for _, char := range line {
			color.New(color.FgYellow).Print(string(char))
			time.Sleep(5 * time.Millisecond)
		}
		fmt.Println()
	}
	fmt.Print("\033[?25h")

	var template string

	// Loop through the files in the current directory
	filepath.Walk(".", func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		// Check if the file name is prefixed with the specified prefix.
		if info.IsDir() {
			return nil
		}
		if filepath.HasPrefix(filepath.Base(path), "next.config") {
			color.New(color.FgBlue, color.Bold).Print(">")
			fmt.Println("  Next.js detected. This will...")
			fmt.Println("   - create an sst.config.ts")
			fmt.Println("   - modify the tsconfig.json")
			fmt.Println("   - add the sst sdk to package.json")
			fmt.Println()
			template = "nextjs"
		} else if filepath.HasPrefix(filepath.Base(path), "astro.config") {
			color.New(color.FgBlue, color.Bold).Print(">")
			fmt.Println("  Astro detected. This will...")
			fmt.Println("   - create an sst.config.ts")
			fmt.Println("   - modify the astro.config.mjs")
			fmt.Println("   - add the sst sdk to package.json")
			fmt.Println()
			template = "astro"
		} else if filepath.HasPrefix(filepath.Base(path), "remix.config") || (filepath.HasPrefix(filepath.Base(path), "vite.config") && fileContains(path, "@remix-run/dev")) {
			color.New(color.FgBlue, color.Bold).Print(">")
			fmt.Println("  Remix detected. This will...")
			fmt.Println("   - create an sst.config.ts")
			fmt.Println("   - add the sst sdk to package.json")
			fmt.Println()
			template = "remix"
		}

		if template != "" {
			return fmt.Errorf("file found")
		}

		return nil
	})

	if template == "" {
		color.New(color.FgBlue, color.Bold).Print(">")
		fmt.Println("  No frontend detected. This will...")
		fmt.Println("   - use the vanilla template")
		fmt.Println("   - create an sst.config.ts")
		fmt.Println()
		template = "vanilla"
	}

	p := promptui.Select{
		Label:        "‏‏‎ ‎Continue",
		HideSelected: true,
		Items:        []string{"Yes", "No"},
		HideHelp:     true,
	}

	_, confirm, err := p.Run()
	if err != nil {
		return util.NewReadableError(err, "")
	}
	if confirm == "No" {
		return nil
	}

	color.New(color.FgGreen, color.Bold).Print("✓ ")
	color.New(color.FgWhite).Println(" Template: ", template)
	fmt.Println()

	home := "aws"
	if template != "nextjs" && template != "astro" && template != "remix" {
		p = promptui.Select{
			Label:        "‏‏‎ ‎Where do you want to deploy your app? You can change this later",
			HideSelected: true,
			Items:        []string{"aws", "cloudflare"},
			HideHelp:     true,
		}
		_, home, err = p.Run()
		if err != nil {
			return util.NewReadableError(err, "")
		}
	}

	color.New(color.FgGreen, color.Bold).Print("✓ ")
	color.New(color.FgWhite).Println(" Using: " + home)
	fmt.Println()

	err = project.Create(template, home)
	if err != nil {
		return err
	}
	var cmd *exec.Cmd

	if _, err := os.Stat("package-lock.json"); err == nil {
		cmd = exec.Command("npm", "install")
	}
	if _, err := os.Stat("yarn.lock"); err == nil {
		cmd = exec.Command("yarn", "install")
	}
	if _, err := os.Stat("pnpm-lock.yaml"); err == nil {
		cmd = exec.Command("pnpm", "install")
	}
	if _, err := os.Stat("bun.lockb"); err == nil {
		cmd = exec.Command("bun", "install")
	}
	if cmd != nil {
		spin := spinner.New(spinner.CharSets[14], 100*time.Millisecond)
		spin.Suffix = "  Installing dependencies..."
		spin.Start()
		slog.Info("installing deps", "args", cmd.Args)
		cmd.Run()
		spin.Stop()
	}

	slog.Info("initializing project", "template", template)
	_, err = initProject(cli)
	if err != nil {
		return err
	}
	color.New(color.FgGreen, color.Bold).Print("✓ ")
	color.New(color.FgWhite).Println(" Success 🎉")
	fmt.Println()
	return nil
}

func fileContains(filePath string, str string) bool {
	file, err := os.Open(filePath)
	if err != nil {
		return false
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		if strings.Contains(scanner.Text(), str) {
			return true
		}
	}

	if err := scanner.Err(); err != nil {
		return false
	}

	return false
}
