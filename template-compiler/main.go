package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"html/template"
	"log"
	"os"
	"path/filepath"
)

func main() {
	var (
		templateName = flag.String("template", "", "Template name to compile")
		outputFile   = flag.String("output", "", "Output file path")
		dataFile     = flag.String("data", "", "JSON data file (optional)")
		templateDir  = flag.String("templates", "./views", "Templates directory")
	)
	flag.Parse()

	if *templateName == "" || *outputFile == "" {
		fmt.Println("Usage: template-compiler -template=<name> -output=<file> [-data=<json>] [-templates=<dir>]")
		os.Exit(1)
	}

	// Parse all templates in the directory
	tmpl, err := template.ParseGlob(filepath.Join(*templateDir, "*.tmpl"))
	if err != nil {
		log.Fatalf("Failed to parse templates: %v", err)
	}

	// Load data if provided
	var data interface{} = struct{}{}
	if *dataFile != "" {
		jsonData, err := os.ReadFile(*dataFile)
		if err != nil {
			log.Fatalf("Failed to read data file: %v", err)
		}
		if err := json.Unmarshal(jsonData, &data); err != nil {
			log.Fatalf("Failed to parse JSON data: %v", err)
		}
	}

	// Create output directory if it doesn't exist
	if err := os.MkdirAll(filepath.Dir(*outputFile), 0755); err != nil {
		log.Fatalf("Failed to create output directory: %v", err)
	}

	// Create output file
	outFile, err := os.Create(*outputFile)
	if err != nil {
		log.Fatalf("Failed to create output file: %v", err)
	}
	defer outFile.Close()

	// Execute template
	if err := tmpl.ExecuteTemplate(outFile, *templateName+".tmpl", data); err != nil {
		log.Fatalf("Failed to execute template: %v", err)
	}

	fmt.Printf("Template %s compiled to %s\n", *templateName, *outputFile)
}
