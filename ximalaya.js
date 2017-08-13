const http = require("http");
const fs = require("fs");
const spawn = require("child_process").spawn;
const readline = require("readline");

function main(){
  var url = process.argv[1];
  /* request = request.defaults({ */
    // agent:false
  /* }) */
  // var fileinfo1 = new FileInfo("01","http://audio.xmcdn.com/group18/M06/AE/D7/wKgJJVe7B6fBZr00ABqiOS5YkyA154.m4a");
  // var fileinfo2 = new FileInfo("02","http://audio.xmcdn.com/group19/M04/85/5A/wKgJK1eq6y7Bvy5wACuOG4X60uU067.m4a");
  // var fileinfo1 = new FileInfo("01","http://localhost/01.m4a");
  // var fileinfo2 = new FileInfo("02","http://localhost/01.m4a");
  // var fileinfo3 = new FileInfo("03","http://localhost/01.m4a");
  var fsm = new StateMachine();
  var page = new Page("http://www.ximalaya.com/48536908/album/4264862/");
  // var sound = new Sound("15526502");
  fsm.enqueue(page);
  // fsm.enqueue(sound);
  fsm.start();
  page.on("end",function(page){
    console.log("this is the end",page.title)
    var p = new Page("http://www.ximalaya.com/48536908/album/4264862?page=2")
    fsm.enqueue(p)
  })
  process.on('SIGINT', function(){
    fsm.clean();
    process.exit(0);
  });
}
function Page(path){
  this.path = path;
  this.sounds = [];
  this.state = 0;
  this.events = {};
}
Page.prototype.download = function(){
  var self = this;
  self.state = 1;
  http.get(self.path,function(res){
    var chunks = [];
    var size = 0;
    res.on("data",function(chunk){
      chunks.push(chunk);
      size += chunk.length;
    }).on("end",function(){
      self.state = 2;
      var buf = Buffer.concat(chunks,size);
      var html = buf.toString();
      var re = /class="personal_body" sound_ids="(.*?)"/;
      var match = re.exec(html);
      if(match){
        self.sounds = match[1].split(",");
        // console.log(self.sounds);
        self.trigger("end",self);
      }
    })
  })
}
Page.prototype.transition = function(fsm){
  switch(this.state){
    case 0:
      this.download(fsm);
      break;
  }
}
Page.prototype.toString = function(){
  return "";
}
Page.prototype.isEnd =function(){
  return this.state === 7;
}
Page.prototype.clean = function(){}
Page.prototype.on = function(type,handler){
  var handlers;
  handlers = this.events[type];
  if(!handlers){ 
    handlers = this.events[type] = [];
  }
  handlers.push(handler);
}
Page.prototype.trigger = function(type){
  var handers;
  var self = this;
  handers = this.events[type];
  if(handers){
    var args = Array.prototype.slice.call(arguments,1);
    handers.forEach(function(handler){
      handler.apply(this,args)
    })
  }
}

function Sound(id){
  this.id = id;
  this.size = 0;
  this.percent = 0;
  this.downloaded = 0;
  this.speed = 0;
  this.time = "00:00:00.00";
  this.state = 0;//1 create 2 response 3 downloading 4 m4a 5 start_convert 6 converting 7 mp3
}
Sound.prototype.getPath = function(){
  var self = this;
  self.state = 1;
  var url = "http://www.ximalaya.com/tracks/" + self.id + ".json";
  http.get(url,function(res){
    var chunks = [];
    var size = 0;
    res.on("data",function(chunk){
      chunks.push(chunk);
      size += chunk.length;
    }).on("end",function(){
      self.state = 2;
      var buf = Buffer.concat(chunks,size);
      var sound = JSON.parse(buf.toString());
      self.title = sound.title;
      self.path = sound.play_path;
    })
  })
}
Sound.prototype.download = function(){
  var self = this;
  self.state = 3;
  var writeStream = fs.createWriteStream(self.getFileName());
  http.get(self.path,function(res){
    self.state = 4;
    self.size = res.headers["content-length"];
    res.on("data",function(chunk){
      self.state = 5;
      var len = chunk.length;
      self.downloaded += len;
      self.speed = Math.ceil(len / 1024);
      self.percent = Math.ceil(self.downloaded / self.size * 100);
      writeStream.write(chunk);
    }).on("end",function(){
      self.state = 6;
    })
  })
}
Sound.prototype.convert = function(){
  var self = this;
  self.state = 7;
  var ffmpeg = spawn("ffmpeg",["-y","-i",self.getFileName(4),"-acodec","libmp3lame",self.getFileName()]);
  ffmpeg.stderr.on("data",function(chunk){
    self.state = 8;
    var msg = chunk.toString();
    var start = msg.indexOf("time=");
    var end = msg.indexOf(" bitrate");
    if(start > -1 && end > -1){
      self.time = msg.substring(start+5,end);
    }
  }).on("end",function(){
    self.state = 9;
  });
}
Sound.prototype.transition = function(){
  switch(this.state){
    case 0:
      this.getPath();
      break;
    case 2:
      this.download();
      break;
    case 6:
      this.convert();
      break;
  }
}
Sound.prototype.toString =  function(){
  switch(this.state){
    case 1:
      return this.getFileName() + "本地文件创建成功！";
    case 2:
      return this.getFileName() + "开始下载！";
    case 3:
      return this.getFileName() + "下载完成" + this.percent + "%";
    case 4:
      return this.getFileName() + "下载完成！";
    case 5:
      return this.getFileName() + "准备转换为mp3!";
    case 6:
      return this.getFileName() + "转换用时" + this.time;
    case 7:
      return this.getFileName() + "转换完成！"
  }
}
Sound.prototype.isEnd = function(){
  return this.state == 7;
}
Sound.prototype.getFileName = function(state){
  state = state || this.state;
  switch(state){
    case 1:
    case 2:
    case 3:
    case 4:
      return this.title + ".m4a";
    case 5:
    case 6:
    case 7:
      return this.title + ".mp3";
  }
}
Sound.prototype.clean = function(){

}

function StateMachine(){
  this.queue = [];
  this.running = [];
  this.timer = 0;
  this.cursorDx = 0;
  this.cursorDy = 0;
}
StateMachine.MAX_THREADS = 3;
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
    file.transition(fsm);
    states.push(file.toString());
    if(file.isEnd()){
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

StateMachine.prototype.clean = function(){
  for(var i = 0;i < this.running.length; i++){
    var file = this.running[i];
    file.clean();
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
/*
var url = "http://www.ximalaya.com/48536908/album/4264862/"
http.get(url,function(res){
  var chunks = [];
  var size = 0;
  console.log("header",res.headers);
  res.on("data",function(chunk){
    chunks.push(chunk);
    size += chunk.length;
  }).on("end",function(){
    var buf = Buffer.concat(chunks,size);
    console.log("end",size);
  })
})
*/
