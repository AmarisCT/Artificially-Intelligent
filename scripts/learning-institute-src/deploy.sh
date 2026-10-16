#!/bin/sh
set -e
R=/home/claude/src/repo; D=$R/learning-institute
mkdir -p $D
cd /home/claude/build/li
python3 build_li.py $R
cat ../inq/styles.css li-extra.css > $D/styles.css
cp index.html activities.js app.js $D/
