# AI Platform Core — Immutable Doable Extraction

This directory is the beginning of the executable reusable-source extraction from Doable.

## Immutable source

- Source repository: Rilan-Dev/Doable
- Source ref: develop
- Source commit: a6036d1fd6dca83c08ee5affa141e5c85e45f5af
- Current extraction slice: multi-provider AI foundation
- Source files are copied byte-for-byte and must not be edited.

## Current slice

The first slice preserves the shared AI provider catalog/types/data plus the API provider interface, runtime configuration and stream-event factories.

The source paths are retained under ai-platform-core/doable-source/ so the original repository-relative layout remains visible and traceable.

## Verification

extraction-manifest.json records the expected source Git blob SHA for every extracted file.

The extraction process must fail on blob SHA mismatch, missing source file, modified immutable file, duplicate/substitute implementation, or undocumented dependency.

This package is intentionally in progress. Do not treat the current slice as a complete AI platform.
