package main

import (
	"encoding/csv"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
)

func main() {
	var (
		translationsPath = flag.String("translations", "locales/translations.csv", "Path to translations CSV")
		unitsPath        = flag.String("units", "locales/units.csv", "Path to units CSV")
		outputPath       = flag.String("output", "locales/translations.js.tmp", "Path to output JS file")
	)
	flag.Parse()

	translations, err := readLocaleCSV(*translationsPath)
	if err != nil {
		log.Fatalf("Failed to read translations: %v", err)
	}

	units, err := readLocaleCSV(*unitsPath)
	if err != nil {
		log.Fatalf("Failed to read units: %v", err)
	}

	if err := writeOutput(*outputPath, translations, units); err != nil {
		log.Fatalf("Failed to write output: %v", err)
	}
}

// readLocaleCSV reads a CSV whose first column is the key and whose remaining
// columns are named by locale code in the header row (e.g. key,en,fr,zh).
// Every non-empty cell becomes entry[locale]; empty cells are omitted.
func readLocaleCSV(path string) (map[string]map[string]string, error) {
	header, rows, err := readCSV(path)
	if err != nil {
		return nil, err
	}
	result := make(map[string]map[string]string, len(rows))
	for _, row := range rows {
		entry := make(map[string]string, len(header)-1)
		for i, locale := range header[1:] {
			if i+1 < len(row) && row[i+1] != "" {
				entry[locale] = row[i+1]
			}
		}
		result[row[0]] = entry
	}
	return result, nil
}

func readCSV(path string) ([]string, [][]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, nil, err
	}
	defer f.Close()

	r := csv.NewReader(f)
	header, err := r.Read()
	if err != nil {
		return nil, nil, fmt.Errorf("reading header: %w", err)
	}

	var rows [][]string
	for {
		row, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, nil, err
		}
		rows = append(rows, row)
	}
	return header, rows, nil
}

func writeOutput(path string, translations, units map[string]map[string]string) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	tJSON, err := json.MarshalIndent(translations, "", "  ")
	if err != nil {
		return err
	}
	fmt.Fprintf(f, "EAE['translations'] = %s;\n", tJSON)

	uJSON, err := json.MarshalIndent(units, "", "  ")
	if err != nil {
		return err
	}
	fmt.Fprintf(f, "EAE['units'] = %s;\n", uJSON)

	return nil
}
