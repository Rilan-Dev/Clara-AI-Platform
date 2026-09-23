#!/bin/bash
# Sequential VLM analysis with delay to avoid 429
OUT=/home/z/my-project/scripts/vlm-results
mkdir -p "$OUT"

PROMPT='Describe this screenshot concisely: what app/screen is shown and its key UI elements. Then classify: is this the Clara AI Platform app (admin sidebar with Agents section, chat window with voice, publish screen) OR the ElevenLabs admin dashboard (dark sidebar, Agent/Phone Numbers/Knowledge Base config) OR something else? Answer format: DESCRIPTION: <2-3 sentences> APP: <which app> SCREEN: <name>'

declare -A FILES=(
  ["sep20_1789869073247"]="/home/z/my-project/upload/pasted_image_1789869073247.png"
  ["sep21_1789983409291"]="/home/z/my-project/upload/pasted_image_1789983409291.png"
  ["sep21_76058_sample"]="/home/z/my-project/upload/pasted_image_1789983445558.png"
  ["sep21_1789991062571"]="/home/z/my-project/upload/pasted_image_1789991062571.png"
  ["sep21_1789991137182"]="/home/z/my-project/upload/pasted_image_1789991137182.png"
  ["sep21_1789991219077"]="/home/z/my-project/upload/pasted_image_1789991219077.png"
)

for name in "${!FILES[@]}"; do
  if [ -f "$OUT/${name}.json" ]; then echo "skip $name (exists)"; continue; fi
  for attempt in 1 2 3; do
    z-ai vision -p "$PROMPT" -i "${FILES[$name]}" -o "$OUT/${name}.json" 2>/dev/null && break
    echo "retry $name (attempt $attempt)"; sleep 15
  done
  echo "done: $name"; sleep 5
done
echo "ALL DONE"
