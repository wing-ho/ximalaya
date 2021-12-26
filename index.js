const https = require("https");
const http = require("http");
const fs = require("fs");
const { spawn } = require("child_process");
const readline = require("readline");
const util = require("util");
const URL = require("url");
const path = require("path");
const events = require("events");
const { info } = require("console");

const dest = process.argv[3] || path.resolve("download")

let fsm = null;
let pagesize = 20;
let pageId = 1;
function getURL(albumId, pageId) {  
  let ts = Date.now();
  return "https://mobile.ximalaya.com/mobile/v1/album/track/ts-"+ts+"?albumId="+albumId+"&device=android&isAsc=true&isQueryInvitationBrand=true&pageId="+pageId+"&pageSize="+pagesize+"&pre_page=0"
}

function main() {
  let url = process.argv[2]
  if (!url) {
    usage();
    return;
  }

  let groups = url.match(/\/([0-9]+)/);
  let albumId = groups[1];
  url = getURL(albumId, pageId);

  fs.exists(dest, function (exists) {
    if (!exists) {
      fs.mkdir(dest, () => { })
    }
  })
  fsm = new StateMachine();
  var page = new File(url);
  fsm.enqueue(page);
  fsm.start();

  page.on("downloaded", function () {    
    let resData = JSON.parse(this.content);    
    let maxPageId = resData.data.maxPageId;    
    for (let pageId = 2; pageId <= maxPageId; pageId++) {
      let url = getURL(albumId, pageId)      
      var p = new File(url);
      fsm.enqueue(p);
    }
  })

  process.on('SIGINT', function () {
    fsm.finish();
    process.exit(0);
  });
}
function usage() {
  console.log("Usage: node index.js url dest_folder?")
  console.log("Example: node index.js https://www.ximalaya.com/album/4264862 目录(可选)")
}
function File(url) {
  this.url = url;
  this.filename = path.basename(URL.parse(url).pathname);
  this.size = 0;
  this.percent = 0;
  this.downloaded = 0;
  this.speed = 0;
  this.content = "";
  this.contentType = "";
  this.state = "create";// create  enqueue  response  data  download convert converting finish
  events.EventEmitter.call(this);
}
util.inherits(File, events.EventEmitter);
File.prototype.setTitle = function (title) {
  let extname = path.extname(this.url)
  if (extname != "") {
    this.filename = title.replace(/[\/:*?"<>|]/g, "") + extname;
  }
}
File.prototype.toString = function () {
  var result = "";
  switch (this.state) {
    case "create":
    case "enqueue":
      result = util.format("%s开始下载！", this.filename);
      break;
    case "data":
      if (this.isBinaryFile()) {
        result = util.format("%s下载完成%d%", this.filename, this.percent);
      }
      break;
    case "downloaded":
      result = util.format("%s下载完成!", this.filename);
      break;
    case "convert":
      result = util.format("%s准备转换为mp3!", this.filename);
      break;
    case "converting":
      result = util.format("%s转换用时%s", this.filename, this.time);
      break;
    case "finish":
      result = util.format("%s任务完成！", this.filename);
      break;
  }
  return result;
}
File.prototype.download = function () {
  let self = this;
  self.state = "enqueue";
  let request = http
  if (self.url.startsWith("https")) {
    request = https
  }
  let options = URL.parse(self.url);

  options = Object.assign(options, {
    headers: {
      // set vip cookie
      // 'Cookie':"1&_token=186186830&F7BE8C60340N82EB86B994AA1929E774B3BCB8C3971A7EAB0DA438457CDCFCE2697B77728ED767M74B673D8FFBC77F_",
      'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36"

    }
  })
  request.get(options, function (res) {
    self.state = "response";
    var chunks = [];
    self.size = res.headers["content-length"] || 0;
    self.contentType = res.headers["content-type"];
    if (res.statusCode == 301) {
      self.url = res.req.protocol + "//" + res.req.host + res.headers.location;
      self.state = "create";
      return;
    }

    if (self.isBinaryFile()) {    
      // use title as filename
      // self.filename = self.title.replace(/[\/:*?"<>|]/g,"") +"."+ self.extname();
      var writeStream = fs.createWriteStream(path.join(dest, self.filename));
    }
    res.on("data", function (chunk) {
      self.state = "data";
      var len = chunk.length;
      self.downloaded += len;
      self.speed = Math.ceil(len / 1024);
      if (self.isBinaryFile()) {
        self.percent = Math.ceil(self.downloaded / self.size * 100);
        writeStream.write(chunk);
      } else {
        chunks.push(chunk);
      }
    }).on("end", function () {
      self.state = "downloaded";
      self.size = self.downloaded;
      if (!self.isBinaryFile()) {
        var buf = Buffer.concat(chunks, self.size);
        self.content = buf.toString();
      }
      self.emit("downloaded");
    })
  })
}

File.prototype.getMediaFile = function () {  
  let resData = JSON.parse(this.content);  
  let tracks = resData.data.list;
  for (let i = 0; i < tracks.length; i++) {
    let track = new File(tracks[i].playUrl64)
    track.setTitle(tracks[i].title);    
    fsm.enqueue(track);
  }
}

File.prototype.toMp3 = function () {
  var self = this;
  self.state = "convert";
  var basename = path.basename(self.filename, ".m4a");
  self.filename = basename + ".mp3";
  self.time = "00:00:00.00";
  var ffmpeg = spawn("ffmpeg", ["-y", "-i", basename + ".m4a", "-acodec", "libmp3lame", self.filename]);
  ffmpeg.stderr.on("data", function (chunk) {
    self.state = "converting";
    var msg = chunk.toString();
    var start = msg.indexOf("time=");
    var end = msg.indexOf(" bitrate");
    if (start > -1 && end > -1) {
      self.time = msg.substring(start + 5, end);
    }
  }).on("end", function () {
    self.state = "finish";
  });
}
File.prototype.isBinaryFile = function () {
 return this.is("m4a") || this.is("mp3");
}
File.mime_types = {
  "audio/mpeg": "mp3",
  "audio/x-m4a": "m4a",
  "text/html": "html",
  "text/plain": "json"
}
File.prototype.extname = function () {
  var mime = this.contentType.split(";")[0].toLowerCase();
  var ext = File.mime_types[mime];
  return ext;
}
File.prototype.is = function (extname) {
  var re = new RegExp(extname);
  return re.test(this.extname());
}
File.prototype.transition = function () {
  if (this.state === "create") {
    this.download();
  } else if (this.state === "downloaded") {
    switch (this.extname()) {
      case "json":
        this.getMediaFile();
        this.finish();
        break;
      case "m4a":
      // use ffmpeg convert m4a to mp3
      // this.toMp3();
      // break;
      case "mp3":
        this.finish();
        break;
      case "html":
        this.finish();
        break;
    }
  }
}

File.prototype.isFinish = function () {
  return this.state === "finish";
}
File.prototype.finish = function () {
  if (this.isBinaryFile()) {
    if ("data" === this.state || "converting" === this.state) {
      fs.unlinkSync(this.filename);
    }
  }
  this.state = "finish";
}

function StateMachine() {
  this.queue = [];
  this.running = [];
  this.timer = 0;
  this.cursorDx = 0;
  this.cursorDy = 0;
}
StateMachine.MAX_THREADS = 5;
StateMachine.current_threads = 0;
StateMachine.idle_threads = function () {
  return StateMachine.MAX_THREADS - StateMachine.current_threads;
}

StateMachine.prototype.start = function () {
  var self = this;
  this.timer = setInterval(function () {
    self.dequeue();
    if (self.queue.length === 0 && self.running.length === 0) {
      clearInterval(self.timer);
    }
  }, 200);
}
StateMachine.prototype.enqueue = function (file) {
  this.queue.push(file);
}
StateMachine.prototype.dequeue = function () {
  var len = StateMachine.idle_threads();
  for (var i = 0; i < len && this.queue.length > 0; i++) {
    var file = this.queue.shift();
    StateMachine.current_threads++;
    this.running.push(file);
  }
  this.transition();
}
StateMachine.prototype.transition = function () {
  var states = [], stdout = process.stdout;
  for (var i = 0; i < this.running.length; i++) {
    var file = this.running[i];
    file.transition();
    states.push(file.toString());
    if (file.isFinish()) {
      this.running.splice(i, 1);
      i--;
      StateMachine.current_threads--;
    }
  }
  var content = states.join("\n");
  readline.moveCursor(stdout, this.cursorDx, this.cursorDy);
  readline.clearScreenDown(stdout);
  stdout.write(content);
  var rec = getDisplayRectangle(content);
  this.cursorDx = -1 * rec.width;
  this.cursorDy = -1 * rec.height;
}

StateMachine.prototype.finish = function () {
  for (var i = 0; i < this.running.length; i++) {
    var file = this.running[i];
    file.finish();
  }
}
function getDisplayRectangle(str) {
  var width = 0, height = 0, maxWidth = 0, len = str.length, charCode = -1;
  for (var i = 0; i < len; i++) {
    charCode = str.charCodeAt(i);
    if (charCode === 10) {
      if (width > maxWidth) {
        maxWidth = width;
      }
      height += Math.floor(width / process.stdout.columns);
      width = 0;
      height++;
    }
    if (charCode >= 0 && charCode <= 255) {
      width += 1;
    } else {
      width += 2;
    }
  }
  return {
    width: maxWidth || width,
    height: height
  }
}
main();
