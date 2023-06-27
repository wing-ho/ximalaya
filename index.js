const https = require("https");
const http = require("http");
const { access, accessSync, mkdirSync, createWriteStream, unlinkSync, exists } = require("fs");
const { spawn } = require("child_process");
const readline = require("readline");
const util = require("util");
const URL = require('url');
const path = require("path");
const EventEmitter = require("events");
var CryptoJS = require("crypto-js");
const { info } = require("console");

const dest = process.argv[3] || path.resolve("download")

let queue;
let pagesize = 20;
let pageId = 1;
let quality = 24
let isAsc = false;
let albumOrTrack = "album"

function getTrackBaseInfo(trackId) {
  let ts = Date.now();
  return "https://mobile.ximalaya.com/mobile-playpage/track/v3/baseInfo/" + ts + "?device=web&trackId=" + trackId;
}

function getAlbumInfo(albumId, pageId) {
  let ts = Date.now();
  // return "https://mobile.ximalaya.com/mobile/v1/album/track/ts-" + ts + "?albumId=" + albumId + "&device=web&isAsc=true&pageId=" + pageId + "&pageSize="+pagesize+"&pre_page=0"
  return "https://mobile.ximalaya.com/mobile/v1/album/track/ts-" + ts + "?albumId=" + albumId + "&device=android&isAsc=" + isAsc + "&isQueryInvitationBrand=true&pageId=" + pageId + "&pageSize=" + pagesize + "&pre_page=0"
}

// 存在只有m4a格式，没有mp3格式的情况
function getURLFromEncodeDataList(playUrlList, quality) {
  let qualities = ["64", "128", "32", "24"]
  // let types = ["M4A","MP3"]
  let types = ["MP3", "M4A","AAC"]
  let item
  loop:
  for (let i = 0; i < types.length; i++) {
    for (let j = 0; j < qualities.length; j++) {
      let type = types[i].concat('_').concat(qualities[j])
      for (let k = 0; k < playUrlList.length; k++) {
        item = playUrlList[k]
        if (item.type == type) {
          break loop;
        }
      }
    }
  }
  return CryptoJS.AES.decrypt({ ciphertext: CryptoJS.enc.Base64url.parse(item.url) },
    CryptoJS.enc.Hex.parse("aaad3e4fd540b0f79dca95606e72bf93"),
    { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }).toString(CryptoJS.enc.Utf8);
}

function main() {
  let url = process.argv[2]
  if (!url) {
    url = "https://www.ximalaya.com/album/19226647"
    usage();
    return;
  }
  access(dest, (err) => {
    if (err) {
      mkdirSync(dest)
    }
  })
  queue = new Queue()
  let albumId;
  let trackId;
  let groups = url.match(/(album|sound)\/([0-9]+)/);
  albumOrTrack = groups[1];
  if (albumOrTrack == "sound") {
    trackId = groups[2]
    url = getTrackBaseInfo(trackId)
    let file = new File(url)
    file.type = "track"
    queue.enqueue(file);
  } else {
    albumId = groups[2]
    url = getAlbumInfo(albumId, pageId)
    let page = new File(url)
    page.type = "page"
    queue.enqueue(page);
    page.on("downloaded", function () {
      let resData = JSON.parse(this.content);
      if ("data" in resData && "maxPageId" in resData.data) {
        let maxPageId = resData.data.maxPageId;
        for (let pageId = 2; pageId <= maxPageId; pageId++) {
          let url = getAlbumInfo(albumId, pageId)
          var page = new File(url);
          queue.enqueue(page);
        }
      }
    })
  }

  queue.showProcess();

  process.on('SIGINT', function () {
    queue.end();
    process.exit(0);
  });
}
function usage() {
  console.log("Usage: node index.js url dest_folder?")
  console.log("Example: node index.js https://www.ximalaya.com/album/4264862 目录(可选)")
}

class File extends EventEmitter {
  constructor(url) {
    super()
    this.url = url
    this.filename = path.basename(new URL.URL(url).pathname);
    this.size = 0;
    this.speed = 0;
    this.downloaded = 0
    this.content = "";
    this.contentType = "";
    this.type = "page"; // page track mp3 
    this.state = "create";// create  enqueue  response  data downloeaded 
  }
  get percent() {
    return Math.ceil(this.downloaded / this.size * 100);
  }
  set title(title) {
    let extname = path.extname(this.filename)
    if (extname != "") {
      this.filename = title.replace(/[\/:*?"<>|]/g, "") + extname
      this.path = path.join(dest, this.filename)
    }
  }
  isBinaryFile() {
    return this.type == "mp3"
  }
  toString() {
    let result = "";
    switch (this.state) {
      case "create":
      case "enqueue":
        result = util.format("%s开始下载！", this.filename);
        break;
      case "data":
        result = util.format("%s下载完成%d%", this.filename, this.percent);
        break;
      case "downloaded":
        result = util.format("%s下载已完成!", this.filename);
        break;
    }
    return result;
  }
  download() {
    this.state = "enqueue"
    let request = http
    if (this.url.startsWith("https")) {
      request = https
    }

    let options = URL.parse(this.url)
    options = Object.assign(options, {
      headers: {
        // set vip cookie
        // 'Cookie':"1&_token=186186830&F7BE8C60340N82EB86B994AA1929E774B3BCB8C3971A7EAB0DA438457CDCFCE2697B77728ED767M74B673D8FFBC77F_",
        'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36"
      }
    })
    request.get(options, (res) => {
      this.state = "response";
      var chunks = [];
      this.size = res.headers["content-length"] || 0;
      this.contentType = res.headers["content-type"];
      if (res.statusCode == 301) {
        this.url = res.req.protocol + "//" + res.req.host + res.headers.location;
        this.state = "create";
        return
      }

      if (this.isBinaryFile()) {
        try {
          accessSync(this.path)
          this.state = "end"
          queue.dequeue(this)
          return
        } catch (e) {
          this.writeStream = createWriteStream(this.path);
        }
      }

      res.on("data", (chunk) => {
        this.state = "data";
        let len = chunk.length;
        this.downloaded += len;
        this.speed = Math.ceil(len / 1024);
        if (this.writeStream) {
          this.writeStream.write(chunk);
        } else {
          chunks.push(chunk);
        }
      }).on("end", () => {
        this.state = "downloaded";
        this.size = this.downloaded;
        if (!this.writeStream) {
          var buf = Buffer.concat(chunks, this.size);
          this.content = buf.toString();
        }
        this.emit("downloaded");
        this.onDownloaded()
        queue.dequeue()
      })
    })
  }

  getTrack() {
    let resData = JSON.parse(this.content);
    if ("data" in resData && "list" in resData.data) {
      let tracks = resData.data.list;
      let total = resData.data.totalCount;
      let pageId = resData.data.pageId;
      let pageSize = resData.data.pageSize;
      let padlen = String(total).length;
      for (let i = 0; i < tracks.length; i++) {
        let track = tracks[i]
        let index = String((pageId - 1) * pageSize + i + 1).padStart(padlen, '0') + "-"
        // 如果音频的标题自带编号，则取消下一行注释，使用标题自带的编号
        // index = ""
        if (track.isPaid) {
          let url = getTrackBaseInfo(track.trackId)
          let payTrack = new File(url)
          payTrack.type = "track"
          payTrack.index = index
          queue.enqueue(payTrack);
        } else {
          let mp3 = new File(track.playUrl64)
          mp3.type = "mp3"
          mp3.title = index + track.title;
          queue.enqueue(mp3);
        }
      }
    }
  }

  getMediaFile() {
    let resData = JSON.parse(this.content);
    if ("trackInfo" in resData && "playUrlList" in resData.trackInfo) {
      let track = resData.trackInfo
      let url = getURLFromEncodeDataList(track.playUrlList, quality)
      let mp3 = new File(url);
      mp3.type = "mp3"
      mp3.title = this.index + track.title
      queue.enqueue(mp3);
    }
  }
  onDownloaded() {
    switch (this.type) {
      case "page":
        this.getTrack();
        this.end()
        break;
      case "track":
        this.getMediaFile();
        this.end()
        break;
      case "mp3":
        this.end()
        break;
    }
  }

  get isEnd() {
    return this.state === "end";
  }
  end() {
    if (this.type == "mp3" && this.state == "data") {
      unlinkSync(this.path);
    }
    this.state = "end";
  }

}
class Queue {
  MAX_THREADS = 5;
  current_threads = 0
  get idle_threads() {
    return this.MAX_THREADS - this.current_threads;
  }
  constructor() {
    this.queue = [];
    this.timer = 0;
    this.head = 0
    this.tail = 0;
    this.cursorDx = 0;
    this.cursorDy = 0;
  }

  showProcess() {
    this.timer = setInterval(() => {
      this.toString();
      if (this.head == this.tail) {
        clearInterval(this.timer);
      }
    }, 200);
  }
  enqueue(file) {
    this.queue.push(file)
    while (this.tail < this.queue.length && this.idle_threads > 0) {
      this.queue[this.tail].download()
      this.tail++
      this.current_threads++
    }
  }
  dequeue() {
    while (this.head < this.tail) {
      if (!this.queue[this.head].isEnd) {
        break
      }
      this.head++
    }
    if (this.tail < this.queue.length) {
      this.queue[this.tail].download()
      this.tail++
    }
  }
  toString() {
    var content = "", stdout = process.stdout;
    for (var i = this.head; i < this.tail; i++) {
      var file = this.queue[i];
      if (!file.isEnd) {
        content += file.toString()
        if (i + 1 < this.tail) {
          content += "\n"
        }
      }
    }
    readline.moveCursor(stdout, this.cursorDx, this.cursorDy);
    readline.clearScreenDown(stdout);
    stdout.write(content);
    var rec = this.getDisplayRectangle(content);
    this.cursorDx = -1 * rec.width;
    this.cursorDy = -1 * rec.height;
  }

  end() {
    for (var i = this.head; i < this.tail; i++) {
      var file = this.queue[i];
      file.end();
    }
  }
  getDisplayRectangle(str) {
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
}
main()
