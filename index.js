const https = require("https");
const http = require("http");
const fs = require("fs");
const spawn = require("child_process").spawn;
const readline = require("readline");
const util = require("util");
const url =  require("url");
const path = require("path");
const events = require("events");
const cheerio = require('cheerio')

const dest = process.argv[3] || path.resolve("download")

function main(){
  let url = process.argv[2]
  if(!url){
    usage();
    return;
  }
  if(!url.endsWith("/")){
    url += "/"    
  }
  fs.exists(dest,function(exists){
    if (!exists){
      fs.mkdir(dest,()=>{})
    }
  })
  var fsm = new StateMachine();
  var page = new File(url);
  fsm.enqueue(page);
  fsm.start();
  function analyzeSoundIds(){
    let $ = cheerio.load(this.content);
    this.$ = $
    let sound_list = []
    // if can't get id from the page
    // open chrome dev panel -> console to have a test
    // document.querySelectorAll(".sound-list .lF_ a[href]")
    $(".sound-list .lF_ a[href]").each(function(i,e){
      let href = $(this).attr("href")      
      let urls = href.split("/")      
      sound_list.push(urls[urls.length-1])
    })
    
    if(sound_list.length > 0){      
      sound_list.forEach(function(id,i){        
        // https://www.ximalaya.com/tracks/59688379.json
        var url = "https://www.ximalaya.com/tracks/" + id + ".json";
        var sound = new File(url);
        console.log(url);
        fsm.enqueue(sound);
      })
    }
  }
  page.on("downloaded",function(){
    analyzeSoundIds.call(this);    
    const lastPage = this.$('.page-item .page-link span').last().html()
       
    for(var i = 2; i <= lastPage; i++){      
      var p = new File(url + "p" + i + "/");
      p.on("downloaded",analyzeSoundIds);
      fsm.enqueue(p);      
    }
  })
  process.on('SIGINT', function(){
    fsm.finish();
    process.exit(0);
  });
}
function usage(){
  console.log("Usage: node index.js url dest_folder?")
  console.log("Example: node index.js https://www.ximalaya.com/gerenchengzhang/4264862/ 目录(可选)")
}
function File(url){
  this.url = url;
  this.filename = path.basename(url);
  this.size = 0;
  this.percent = 0;
  this.downloaded = 0;
  this.speed = 0;
  this.content = "";
  this.contentType = "";
  this.state = "create";// create  enqueue  response  data  download convert converting finish
  events.EventEmitter.call(this);
}
util.inherits(File,events.EventEmitter);
File.prototype.toString = function(){
  var result = "";
  switch(this.state){
    case "create":
    case "enqueue":
      result = util.format("%s开始下载！",this.filename);
      break;
    case "data":
      if(this.isBinaryFile()){
        result = util.format("%s下载完成%d%",this.filename,this.percent);
      }
      break;
    case "downloaded":
      result = util.format("%s下载完成!",this.filename);
      break;
    case "convert":
      result = util.format("%s准备转换为mp3!",this.filename);
      break;
    case "converting":
      result = util.format("%s转换用时%s",this.filename,this.time);
      break;
    case "finish":
      result = util.format("%s任务完成！",this.filename);
      break;
  }
  return result;
}
File.prototype.download = function(){
  let self = this;
  self.state = "enqueue";
  let request = http
  if(self.url.startsWith("https")){
    request = https
  }
  let options = url.parse(self.url);
  
  options = Object.assign(options,{
    headers: {
      // set vip cookie
      // 'Cookie':"1&_token=186186830&F7BE8C60340N82EB86B994AA1929E774B3BCB8C3971A7EAB0DA438457CDCFCE2697B77728ED767M74B673D8FFBC77F_",
      'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36"

    }
  })
// console.log(options)
  request.get(options,function(res){
    self.state = "response";
    var chunks = [];
    self.size = res.headers["content-length"] || 0;
    self.contentType = res.headers["content-type"];
    if(self.isBinaryFile()){
      var writeStream = fs.createWriteStream(path.join(dest,self.filename));
    }
    res.on("data",function(chunk){
      self.state = "data";
      var len = chunk.length;
      self.downloaded += len;
      self.speed = Math.ceil(len / 1024);
      if(self.isBinaryFile()){
        self.percent = Math.ceil(self.downloaded / self.size * 100);
        writeStream.write(chunk);
      }else{
        chunks.push(chunk);
      }
    }).on("end",function(){
      self.state = "downloaded";
      self.size = self.downloaded;
      if(!self.isBinaryFile()){
        var buf = Buffer.concat(chunks,self.size);
        self.content = buf.toString();
      }
      self.emit("downloaded");
    })
  })
}

File.prototype.getM4a = function(){
  var track = JSON.parse(this.content);
  this.url =  track.play_path;
  this.filename = track.title + ".m4a";
  this.download();
}

File.prototype.toMp3 = function(){
  var self = this;
  self.state = "convert";
  var basename = path.basename(self.filename,".m4a"); 
  self.filename = basename + ".mp3";
  self.time = "00:00:00.00";
  var ffmpeg = spawn("ffmpeg",["-y","-i",basename + ".m4a","-acodec","libmp3lame",self.filename]);
  ffmpeg.stderr.on("data",function(chunk){
    self.state = "converting";
    var msg = chunk.toString();
    var start = msg.indexOf("time=");
    var end = msg.indexOf(" bitrate");
    if(start > -1 && end > -1){
      self.time = msg.substring(start+5,end);
    }
  }).on("end",function(){
    self.state = "finish";
  });
}
File.prototype.isBinaryFile = function(){
  return this.is("m4a"); 
}
File.mime_types = {
  "audio/x-m4a":"m4a",
  "text/html":"html",
  "application/json":"json"
}
File.prototype.extname = function(){
  var mime = this.contentType.split(";")[0].toLowerCase();
  var ext = File.mime_types[mime];
  return ext;
}
File.prototype.is = function(extname){
  var re = new RegExp(extname);
  return re.test(this.extname()); 
}
File.prototype.transition = function(){
  if(this.state === "create"){
    this.download();
  }else if(this.state ==="downloaded"){
    switch(this.extname()){
      case "json":
        this.getM4a();
        break;
      case "m4a":
        // use ffmpeg convert m4a to mp3
        // this.toMp3();
        this.finish();
        break;
      case "html":
        this.finish();
        break;
    }
  }
}

File.prototype.isFinish =function(){
  return this.state === "finish";
}
File.prototype.finish = function(){
  if(this.isBinaryFile()){
    if("data" === this.state || "converting" === this.state){
      fs.unlinkSync(this.filename);
    }
  }
  this.state = "finish";
}

function StateMachine(){
  this.queue = [];
  this.running = [];
  this.timer = 0;
  this.cursorDx = 0;
  this.cursorDy = 0;
}
StateMachine.MAX_THREADS = 5;
StateMachine.current_threads = 0;
StateMachine.idle_threads = function(){
  return StateMachine.MAX_THREADS - StateMachine.current_threads;
}

StateMachine.prototype.start = function(){
  var self = this;
  this.timer = setInterval(function(){
    self.dequeue();
    if(self.queue.length === 0 && self.running.length === 0){
      clearInterval(self.timer);
    }
  },200);
}
StateMachine.prototype.enqueue = function(file){
  this.queue.push(file);
}
StateMachine.prototype.dequeue = function(){
  var len = StateMachine.idle_threads(); 
  for(var i = 0; i < len && this.queue.length > 0; i++){
    var file = this.queue.shift();
    StateMachine.current_threads++;
    this.running.push(file);
  }
  this.transition();
}
StateMachine.prototype.transition = function(){
  var states = [],stdout = process.stdout;
  for(var i = 0; i < this.running.length; i++){
    var file = this.running[i];
    file.transition();
    states.push(file.toString());
    if(file.isFinish()){
      this.running.splice(i,1);
      i--;
      StateMachine.current_threads--;
    }
  }
  var content = states.join("\n");
  readline.moveCursor(stdout,this.cursorDx,this.cursorDy);
  readline.clearScreenDown(stdout);
  stdout.write(content);
  var rec = getDisplayRectangle(content);
  this.cursorDx = -1 * rec.width;
  this.cursorDy = -1 * rec.height;
}

StateMachine.prototype.finish = function(){
  for(var i = 0;i < this.running.length; i++){
    var file = this.running[i];
    file.finish();
  }
}
function getDisplayRectangle(str){
  var width = 0,height = 0,maxWidth = 0, len = str.length, charCode = -1;
  for (var i = 0; i < len; i++) {
    charCode = str.charCodeAt(i);
    if(charCode === 10){
      if(width > maxWidth){
        maxWidth = width;
      }
      height += Math.floor(width / process.stdout.columns);
      width = 0;
      height++;
    }
    if(charCode >= 0 && charCode <= 255){
      width += 1;
    }else{ 
      width += 2;
    }
  }
  return {
    width:maxWidth || width,
    height:height
  }
}
main();
