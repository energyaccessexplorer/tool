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
		convert          = flag.Bool("convert", false, "Convert existing JSON files to CSV and exit")
	)
	flag.Parse()

	if *convert {
		if err := convertFromJSON("locales/translations.json", "locales/units.json"); err != nil {
			log.Fatalf("Convert failed: %v", err)
		}
		fmt.Println("Wrote locales/translations.csv and locales/units.csv")
		return
	}

	translations, err := readTranslations(*translationsPath)
	if err != nil {
		log.Fatalf("Failed to read translations: %v", err)
	}

	units, err := readUnits(*unitsPath)
	if err != nil {
		log.Fatalf("Failed to read units: %v", err)
	}

	if err := writeOutput(*outputPath, translations, units); err != nil {
		log.Fatalf("Failed to write output: %v", err)
	}
}

func readTranslations(path string) (map[string]map[string]string, error) {
	rows, err := readCSV(path)
	if err != nil {
		return nil, err
	}
	result := make(map[string]map[string]string, len(rows))
	for _, row := range rows {
		result[row[0]] = map[string]string{"en": row[1], "fr": row[2]}
	}
	return result, nil
}

func readUnits(path string) (map[string]map[string]string, error) {
	rows, err := readCSV(path)
	if err != nil {
		return nil, err
	}
	result := make(map[string]map[string]string, len(rows))
	for _, row := range rows {
		result[row[0]] = map[string]string{"fr": row[1]}
	}
	return result, nil
}

func readCSV(path string) ([][]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	r := csv.NewReader(f)
	// skip header
	if _, err := r.Read(); err != nil {
		return nil, fmt.Errorf("reading header: %w", err)
	}

	var rows [][]string
	for {
		row, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		rows = append(rows, row)
	}
	return rows, nil
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

func convertFromJSON(translationsJSON, unitsJSON string) error {
	if err := convertTranslations(translationsJSON, "locales/translations.csv"); err != nil {
		return fmt.Errorf("translations: %w", err)
	}
	return convertUnits(unitsJSON, "locales/units.csv")
}

func convertTranslations(jsonPath, csvPath string) error {
	data, err := os.ReadFile(jsonPath)
	if err != nil {
		return err
	}

	// Use ordered pairs to preserve source order in the CSV.
	var ordered []struct {
		Key string
		Val map[string]string
	}
	// First pass: decode into a generic ordered structure via json.Decoder tokens.
	dec := json.NewDecoder(
		func() io.Reader { return jsonReader(data) }(),
	)
	// Decode as map to get all values, then re-read order via token stream.
	var raw map[string]map[string]string
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}

	// Recover insertion order via the token stream.
	dec2 := json.NewDecoder(jsonReader(data))
	dec2.Token() // {
	for dec2.More() {
		tok, _ := dec2.Token()
		key := tok.(string)
		dec2.Token() // {
		dec2.Token() // "en" or "fr"
		dec2.Token() // value
		dec2.Token() // "en" or "fr"
		dec2.Token() // value
		dec2.Token() // }
		ordered = append(ordered, struct {
			Key string
			Val map[string]string
		}{key, raw[key]})
	}
	_ = dec

	f, err := os.Create(csvPath)
	if err != nil {
		return err
	}
	defer f.Close()

	w := csv.NewWriter(f)
	w.Write([]string{"key", "en", "fr"})
	for _, entry := range ordered {
		w.Write([]string{entry.Key, entry.Val["en"], entry.Val["fr"]})
	}
	w.Flush()
	return w.Error()
}

func convertUnits(jsonPath, csvPath string) error {
	data, err := os.ReadFile(jsonPath)
	if err != nil {
		return err
	}

	var raw map[string]map[string]string
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}

	// Recover insertion order via token stream.
	var keys []string
	dec := json.NewDecoder(jsonReader(data))
	dec.Token() // {
	for dec.More() {
		tok, _ := dec.Token()
		keys = append(keys, tok.(string))
		dec.Token() // {
		dec.Token() // "fr"
		dec.Token() // value
		dec.Token() // }
	}

	f, err := os.Create(csvPath)
	if err != nil {
		return err
	}
	defer f.Close()

	w := csv.NewWriter(f)
	w.Write([]string{"unit", "fr"})
	for _, key := range keys {
		w.Write([]string{key, raw[key]["fr"]})
	}
	w.Flush()
	return w.Error()
}

type byteReader struct{ b []byte; pos int }

func (r *byteReader) Read(p []byte) (int, error) {
	if r.pos >= len(r.b) {
		return 0, io.EOF
	}
	n := copy(p, r.b[r.pos:])
	r.pos += n
	return n, nil
}

func jsonReader(b []byte) io.Reader { return &byteReader{b: b} }
