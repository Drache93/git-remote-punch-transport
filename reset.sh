#!/bin/sh

rm -rf ~/.gip
remote=$(./bin-tui.js new git-remote | tr ' ' '\n' | tail -1)
echo $remote

git remote remove gip || echo 'OK'
git remote add gip $remote
