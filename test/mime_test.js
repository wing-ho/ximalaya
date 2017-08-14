#!/usr/bin/env node
var mime = require("mime-types");
var contentType = mime.contentType("html");
console.log(contentType)
console.log(mime.extension("audio/x-m4a"))
console.log(mime.extension("text/html"))
