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

	tmpl, err := template.ParseGlob(filepath.Join(*templateDir, "*.tmpl"))
	if err != nil {
		log.Fatalf("Failed to parse templates: %v", err)
	}

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

	if err := os.MkdirAll(filepath.Dir(*outputFile), 0755); err != nil {
		log.Fatalf("Failed to create output directory: %v", err)
	}

	outFile, err := os.Create(*outputFile)
	if err != nil {
		log.Fatalf("Failed to create output file: %v", err)
	}
	defer outFile.Close()

	if err := tmpl.ExecuteTemplate(outFile, *templateName+".tmpl", data); err != nil {
		log.Fatalf("Failed to execute template: %v", err)
	}

	fmt.Printf("Template %s compiled to %s\n", *templateName, *outputFile)
}
