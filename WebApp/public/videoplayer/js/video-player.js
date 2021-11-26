import Signaling, { WebSocketSignaling } from "../../js/signaling.js";
import * as Config from "../../js/config.js";
import * as Logger from "../../js/logger.js";
import { registerGamepadEvents, registerKeyboardEvents, registerMouseEvents, sendClickEvent } from "../../js/register-events.js";



// enum type of event sending from Unity
var UnityEventType = {
  SWITCH_VIDEO: 0
};


function showWarning(message) {
  const warningDiv = document.getElementById("warning");
    warningDiv.innerHTML = "<h4>Warning</h4> "+message;
    warningDiv.hidden = false;
}

function hideWarning(){
    const warningDiv = document.getElementById("warning");
    warningDiv.hidden = true;

}

function uuid4() {
  var temp_url = URL.createObjectURL(new Blob());
  var uuid = temp_url.toString();
  URL.revokeObjectURL(temp_url);
  return uuid.split(/[:\/]/g).pop().toLowerCase(); // remove prefixes
}

export class VideoPlayer {
  constructor(elements) {
    const _this = this;
    this.cfg = Config.getRTCConfiguration();
    this.pc = null;
    this.channel = null;
    this.connectionId = null;

    // main video
    this.localStream = new MediaStream();
    this.video = elements[0];
    this.video.playsInline = true;
    this.video.addEventListener('loadedmetadata', function () {
      _this.video.play();
      _this.resizeVideo();
    }, true);


    this.videoTrackList = [];
    this.videoTrackIndex = 0;
    this.maxVideoTrackLength = 2;

    this.ondisconnect = function () { };
  }

  async setupConnection(useWebSocket) {
    const _this = this;
    // close current RTCPeerConnection
    if (this.pc) {
      Logger.log('Close current PeerConnection');
      this.pc.close();
      this.pc = null;
    }

    if (useWebSocket) {
      this.signaling = new WebSocketSignaling();
    } else {
      this.signaling = new Signaling();
    }

    // Create peerConnection with proxy server and set up handlers
    this.pc = new RTCPeerConnection(this.cfg);
    this.pc.onsignalingstatechange = function (e) {
      Logger.log('signalingState changed:', e);
    };
    this.pc.oniceconnectionstatechange = function (e) {
      Logger.log('iceConnectionState changed:', e);
      Logger.log('pc.iceConnectionState:' + _this.pc.iceConnectionState);
      if (_this.pc.iceConnectionState === 'disconnected') {
        _this.ondisconnect();
      }
    };
    this.pc.onicegatheringstatechange = function (e) {
      Logger.log('iceGatheringState changed:', e);
    };
    this.pc.ontrack = function (e) {
      if (e.track.kind == 'video') {
        _this.videoTrackList.push(e.track);
        _this.localStream.addTrack(e.track);
        _this.video.srcObject = _this.localStream;
      }
      if (e.track.kind == 'audio') {
        _this.localStream.addTrack(e.track);
      }
      if (_this.videoTrackList.length == _this.maxVideoTrackLength) {
        _this.switchVideo(_this.videoTrackIndex);
      }
    };
    this.pc.onicecandidate = function (e) {
      if (e.candidate != null) {
        _this.signaling.sendCandidate(_this.connectionId, e.candidate.candidate, e.candidate.sdpMid, e.candidate.sdpMLineIndex);
      }
    };
    // Create data channel with proxy server and set up handlers
    this.channel = this.pc.createDataChannel('data');
    this.channel.onopen = function () {
      Logger.log('Datachannel connected.');
    };
    this.channel.onerror = function (e) {
      Logger.log("The error " + e.error.message + " occurred\n while handling data with proxy server.");
    };
    this.channel.onclose = function () {
      Logger.log('Datachannel disconnected.');
    };

    this.channel.onmessage = async (msg) => {
      // receive message from unity and operate message
      let data;
      // receive message data type is blob only on Firefox
      if (navigator.userAgent.indexOf('Firefox') != -1) {
        data = await msg.data.arrayBuffer();
      } else {
        data = msg.data;
      }
      // console.log(data);
      if (data == "DeleteButtons"){
        console.log("delete");
        var buttons_delete = document.getElementsByClassName("addedbutton");
        for (var i = 0; i < buttons_delete.length; i++){
          buttons_delete[i].remove();
        }
      }
      else if (data == "SaveTime"){

        var time_str = new Date().toLocaleTimeString();
        document.getElementById("last_saved").innerHTML = time_str; 

      }

      else {
        var data_json = JSON.parse(data);
        console.log(data_json);
        if (data_json["task_name"] == "ButtonInfo"){
          this.showbuttons(JSON.parse(data_json["task_content"]));  
        }
        else if (data_json["task_name"] == "PlayerInfo"){
          var content = data_json["task_content"]
          document.getElementById("playernum").innerHTML = content; 
          if (content == "Player 0"){
            document.getElementById("playernum").style.color = "magenta"; 
          }
          else {
            document.getElementById("playernum").style.color = "blue"; 
          
          }
        }
        else {
          console.log(data_json["task_content"])
          this.updateTask(JSON.parse(data_json["task_content"]))
        }
        
      }
      // const bytes = new Uint8Array(data);
      // _this.videoTrackIndex = bytes[1];
      // switch (bytes[0]) {
      //   case UnityEventType.SWITCH_VIDEO:
      //     _this.switchVideo(_this.videoTrackIndex);
      //     break;
      // }
    };
    this.updateTask = function(task_content){
      var html_str = "<ul>";
      for (var i = 0; i < task_content.length; i++){
        var li = task_content[i]['verb'] + " " + task_content[i]['obj1'] + " " + task_content[i]['relation'] + " " + task_content[i]['obj2'];
        li += ": " + task_content[i]['count'] + "/" + task_content[i]['repetitions'];
        html_str += "<li>"+li+"</li>"
        if(task_content[i]["tutFlag"] != null){
          html_str += "<li> Tutorial Status: ";
          var tutNotice = "";
          if(task_content[i]["tutFlag"] == "1"){
            tutNotice += "Welcome to the tutorial, look around and find a plate.";
          }
          else if(task_content[i]["tutFlag"] == "2"){
            tutNotice += "You found the plate! Now place it on the table.";
          }
          else{
            tutNotice += "You have completed the tutorial! Please explore more or move on.";
          }
          html_str += tutNotice + "</li>";
        }
      }
      html_str += "</ul>";
      document.getElementById("task_content").innerHTML = html_str;
    }
    this.showbuttons = function(buttons){
      var video_player = this;
      var player = document.getElementById("player");
      for (var i = 0; i < buttons.length; i++){
          const button = document.createElement('button');
          button.id = "button_" + i;
          button.it = i;
          button.className = "addedbutton";
          button.innerHTML = buttons[i]['button_str'];
          button.style.left = buttons[i]['button_pos'][0] + "%";
          button.style.top = buttons[i]['button_pos'][1] + "%";
          button.style.display = "inline-block";
          button.style.position = "absolute";
          button.addEventListener("click", function () {
            console.log(this.it);
            var buttons_delete = document.getElementsByClassName("addedbutton");
            for (var i = 0; i < buttons_delete.length; i++){
              buttons_delete[i].remove();
            }
            sendClickEvent(video_player, this.it);
          });
          player.appendChild(button);
          
        // this.createButton(buttons['name'], buttons['position'], buttons['script'])
      }
    }

    this.signaling.addEventListener('answer', async (e) => {
      const answer = e.detail;
      const desc = new RTCSessionDescription({ sdp: answer.sdp, type: "answer" });
      await _this.pc.setRemoteDescription(desc);
    });

    this.signaling.addEventListener('candidate', async (e) => {
      const candidate = e.detail;
      const iceCandidate = new RTCIceCandidate({ candidate: candidate.candidate, sdpMid: candidate.sdpMid, sdpMLineIndex: candidate.sdpMLineIndex });
      await _this.pc.addIceCandidate(iceCandidate);
    });

    // setup signaling
    await this.signaling.start();
    this.connectionId = uuid4();

    // Add transceivers to receive multi stream.
    // It can receive two video tracks and one audio track from Unity app.
    // This operation is required to generate offer SDP correctly.
    this.pc.addTransceiver('video', { direction: 'recvonly' });
    // this.pc.addTransceiver('video', { direction: 'recvonly' });
    // this.pc.addTransceiver('audio', { direction: 'recvonly' });

    // create offer
    const offer = await this.pc.createOffer();

    // set local sdp
    const desc = new RTCSessionDescription({ sdp: offer.sdp, type: "offer" });
    await this.pc.setLocalDescription(desc);
    await this.signaling.sendOffer(this.connectionId, offer.sdp);
  };

  resizeVideo() {
    const clientRect = this.video.getBoundingClientRect();
    const videoRatio = this.videoWidth / this.videoHeight;
    const clientRatio = clientRect.width / clientRect.height;

    this._videoScale = videoRatio > clientRatio ? clientRect.width / this.videoWidth : clientRect.height / this.videoHeight;
    const videoOffsetX = videoRatio > clientRatio ? 0 : (clientRect.width - this.videoWidth * this._videoScale) * 0.5;
    const videoOffsetY = videoRatio > clientRatio ? (clientRect.height - this.videoHeight * this._videoScale) * 0.5 : 0;
    this._videoOriginX = clientRect.left + videoOffsetX;
    this._videoOriginY = clientRect.top + videoOffsetY;
  }

  // switch streaming destination main video and secondly video
  switchVideo(indexVideoTrack) {
    this.video.srcObject = this.localStream;
    //this.videoThumb.srcObject = this.localStream2;

    if (indexVideoTrack == 0) {
      this.replaceTrack(this.localStream, this.videoTrackList[0]);
      // this.replaceTrack(this.localStream2, this.videoTrackList[1]);
    }
    else {
      this.replaceTrack(this.localStream, this.videoTrackList[0]);
      //this.replaceTrack(this.localStream2, this.videoTrackList[0]);
    }
  }

  // replace video track related the MediaStream
  replaceTrack(stream, newTrack) {
    const tracks = stream.getVideoTracks();
    for (const track of tracks) {
      if (track.kind == 'video') {
        stream.removeTrack(track);
      }
    }
    stream.addTrack(newTrack);
  }

  get videoWidth() {
    return this.video.videoWidth;
  }

  get videoHeight() {
    return this.video.videoHeight;
  }

  get videoOriginX() {
    return this._videoOriginX;
  }

  get videoOriginY() {
    return this._videoOriginY;
  }

  get videoScale() {
    return this._videoScale;
  }

  close() {
    if (this.pc) {
      Logger.log('Close current PeerConnection');
      this.pc.close();
      this.pc = null;
    }
  };

  sendMsg(msg) {
    if (this.channel == null) {
      return;
    }
    switch (this.channel.readyState) {
      case 'connecting':
        showWarning("Waiting for connection... There may be other people playing. Try refreshing the page. If you still cannot play contact xavierpuigf@gmail.com")
        Logger.log('Connection not ready');
        break;
      case 'open':
        hideWarning();
        this.channel.send(msg);
        break;
      case 'closing':
        Logger.log('Attempt to sendMsg message while closing');
        break;
      case 'closed':
        Logger.log('Attempt to sendMsg message while connection closed.');
        break;
    }
  };

  async stop() {
    await this.signaling.stop();
  }
}