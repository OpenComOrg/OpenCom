package config

import "testing"

func TestParseCSVSet(t *testing.T) {
	got := parseCSVSet(" bucket-a, bucket-b ,,bucket-a ")

	if len(got) != 2 {
		t.Fatalf("expected 2 buckets, got %d", len(got))
	}

	if _, ok := got["bucket-a"]; !ok {
		t.Fatal("expected bucket-a to be present")
	}

	if _, ok := got["bucket-b"]; !ok {
		t.Fatal("expected bucket-b to be present")
	}
}
