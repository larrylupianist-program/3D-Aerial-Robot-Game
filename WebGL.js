var VSHADER_SOURCE = `
    attribute vec4 a_Position;
    attribute vec4 a_Normal;
    attribute vec2 a_TexCoord;
    uniform mat4 u_MvpMatrix;
    uniform mat4 u_modelMatrix;
    uniform mat4 u_normalMatrix;
    uniform mat4 u_ProjMatrixFromLight;
    uniform mat4 u_MvpMatrixOfLight;
    varying vec4 v_PositionFromLight;
    varying vec3 v_Normal;
    varying vec3 v_PositionInWorld;
    varying vec2 v_TexCoord;
    void main(){
        gl_Position = u_MvpMatrix * a_Position;
        v_PositionInWorld = (u_modelMatrix * a_Position).xyz; 
        v_Normal = normalize(vec3(u_normalMatrix * a_Normal));
        v_PositionFromLight = u_MvpMatrixOfLight * a_Position; //for shadow
        v_TexCoord = a_TexCoord;
    }    
`;

var FSHADER_SOURCE = `
    precision mediump float;
    uniform vec3 u_LightPosition;
    uniform vec3 u_ViewPosition;
    uniform float u_Ka;
    uniform float u_Kd;
    uniform float u_Ks;
    uniform float u_shininess;
    uniform float u_Alpha;
    uniform vec3 u_Color;
    uniform sampler2D u_ShadowMap;
    uniform sampler2D u_Sampler0;      
    uniform bool u_UseTexture;         // 用來切換貼圖/純色
    varying vec3 v_Normal;
    varying vec3 v_PositionInWorld;
    varying vec2 v_TexCoord;           
    varying vec4 v_PositionFromLight;
    const float deMachThreshold = 0.005;
    void main(){ 
        vec3 baseColor = u_UseTexture 
            ? texture2D(u_Sampler0, v_TexCoord).rgb 
            : u_Color;

        vec3 ambient = baseColor * u_Ka;
        vec3 normal = normalize(v_Normal);
        vec3 lightDirection = normalize(u_LightPosition - v_PositionInWorld);
        float nDotL = max(dot(lightDirection, normal), 0.0);
        vec3 diffuse = baseColor * u_Kd * nDotL;

        vec3 specular = vec3(0.0);
        if(nDotL > 0.0) {
            vec3 R = reflect(-lightDirection, normal);
            vec3 V = normalize(u_ViewPosition - v_PositionInWorld); 
            float specAngle = clamp(dot(R, V), 0.0, 1.0);
            specular = u_Ks * pow(specAngle, u_shininess) * vec3(1.0); 
        }

        vec3 shadowCoord = (v_PositionFromLight.xyz/v_PositionFromLight.w)/2.0 + 0.5;
        vec4 rgbaDepth = texture2D(u_ShadowMap, shadowCoord.xy);
        float depth = rgbaDepth.r;
        float visibility = (shadowCoord.z > depth + deMachThreshold) ? 0.3 : 1.0;

        gl_FragColor = vec4((ambient + diffuse + specular) * visibility, u_Alpha);
    }
`;

var VSHADER_SHADOW_SOURCE = `
      attribute vec4 a_Position;
      uniform mat4 u_MvpMatrix;
      void main(){
          gl_Position = u_MvpMatrix * a_Position;
      }
  `;

var FSHADER_SHADOW_SOURCE = `
      precision mediump float;
      void main(){
        /////////** LOW precision depth implementation **/////
        gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0);
      }
  `;

var VSHADER_SOURCE_TEXTURE_ON_CUBE = `
  attribute vec4 a_Position;
  attribute vec4 a_Normal;
  uniform mat4 u_MvpMatrix;
  uniform mat4 u_modelMatrix;
  uniform mat4 u_normalMatrix;
  varying vec4 v_TexCoord;
  varying vec3 v_Normal;
  varying vec3 v_PositionInWorld;
  void main() {
    gl_Position = u_MvpMatrix * a_Position;
    v_TexCoord = a_Position;
    v_PositionInWorld = (u_modelMatrix * a_Position).xyz; 
    v_Normal = normalize(vec3(u_normalMatrix * a_Normal));
  } 
`;

var FSHADER_SOURCE_TEXTURE_ON_CUBE = `
  precision mediump float;
  varying vec4 v_TexCoord;
  uniform vec3 u_ViewPosition;
  uniform vec3 u_Color;
  uniform samplerCube u_envCubeMap;
  varying vec3 v_Normal;
  varying vec3 v_PositionInWorld;
  void main() {
    vec3 V = normalize(u_ViewPosition - v_PositionInWorld); 
    vec3 normal = normalize(v_Normal);
    vec3 R = reflect(-V, normal);
    gl_FragColor = vec4(0.78 * textureCube(u_envCubeMap, R).rgb + 0.3 * u_Color, 1.0);
  }
`;

var VSHADER_SOURCE_ENVCUBE = `
  attribute vec4 a_Position;
  varying vec4 v_Position;
  void main() {
    v_Position = a_Position;
    gl_Position = a_Position.xyww;
  } 
`;

var FSHADER_SOURCE_ENVCUBE = `
  precision mediump float;
  uniform samplerCube u_envCubeMap;
  uniform mat4 u_viewDirectionProjectionInverse;
  varying vec4 v_Position;
  void main() {
    vec4 t = u_viewDirectionProjectionInverse * v_Position;
    gl_FragColor = textureCube(u_envCubeMap, normalize(t.xyz / t.w));
  }
`;



function compileShader(gl, vShaderText, fShaderText){
    //////Build vertex and fragment shader objects
    var vertexShader = gl.createShader(gl.VERTEX_SHADER)
    var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)
    //The way to  set up shader text source
    gl.shaderSource(vertexShader, vShaderText)
    gl.shaderSource(fragmentShader, fShaderText)
    //compile vertex shader
    gl.compileShader(vertexShader)
    if(!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)){
        console.log('vertex shader ereror');
        var message = gl.getShaderInfoLog(vertexShader); 
        console.log(message);//print shader compiling error message
    }
    //compile fragment shader
    gl.compileShader(fragmentShader)
    if(!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)){
        console.log('fragment shader ereror');
        var message = gl.getShaderInfoLog(fragmentShader);
        console.log(message);//print shader compiling error message
    }

    /////link shader to program (by a self-define function)
    var program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    //if not success, log the program info, and delete it.
    if(!gl.getProgramParameter(program, gl.LINK_STATUS)){
        alert(gl.getProgramInfoLog(program) + "");
        gl.deleteProgram(program);
    }

    return program;
}

/////BEGIN:///////////////////////////////////////////////////////////////////////////////////////////////
/////The folloing three function is for creating vertex buffer, but link to shader to user later//////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////
function initAttributeVariable(gl, a_attribute, buffer){
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.vertexAttribPointer(a_attribute, buffer.num, buffer.type, false, 0, 0);
  gl.enableVertexAttribArray(a_attribute);
}

function initArrayBufferForLaterUse(gl, data, num, type) {
  // Create a buffer object
  var buffer = gl.createBuffer();
  if (!buffer) {
    console.log('Failed to create the buffer object');
    return null;
  }
  // Write date into the buffer object
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

  // Store the necessary information to assign the object to the attribute variable later
  buffer.num = num;
  buffer.type = type;

  return buffer;
}

function initVertexBufferForLaterUse(gl, vertices, normals, texCoords){
  var nVertices = vertices.length / 3;

  var o = new Object();
  o.vertexBuffer = initArrayBufferForLaterUse(gl, new Float32Array(vertices), 3, gl.FLOAT);
  if( normals != null ) o.normalBuffer = initArrayBufferForLaterUse(gl, new Float32Array(normals), 3, gl.FLOAT);
  if( texCoords != null ) o.texCoordBuffer = initArrayBufferForLaterUse(gl, new Float32Array(texCoords), 2, gl.FLOAT);
  //you can have error check here
  o.numVertices = nVertices;

  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

  return o;
}
/////END://///////////////////////////////////////////////////////////////////////////////////////////////
/////The folloing three function is for creating vertex buffer, but link to shader to user later//////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////
var XMove = 0;
var ZMove = 0;
var eat = false;
var caneat = false;
var viewScale = 1.0;
var mouseLastX, mouseLastY;
var mouseDragging = false;
var angleX = 0, angleY = 0;
var gl, canvas;
var modelMatrix;
var normalMatrix;
var nVertex;
var cameraX = 1, cameraY = 1, cameraZ = 3;
var playerX = 0, playerY = 1, playerZ = 0;
var playerAngle = 0; // 玩家朝向（度數，繞Y軸）
var lightX = 0, lightY = 4, lightZ = 0;
var cubeObj = [];
var sphereObj = [];
var RobotObj = [];
var offScreenWidth = 2048, offScreenHeight = 2048;
var fbo;
var textures = {};
var texCount = 0;
var numTextures = 6;
var appleDropMatrix = null;
var prevEat = false;
var wallList = [];
var gameInitialized = false;
var lookchange = 1; //1-第三, 0-第一
const moveSpeed = 0.1;
const turnSpeed = 3;
const mazeMap = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
];
var cameraDirX = 0, cameraDirY = 0, cameraDirZ = 1;
var quadObj;
var cubeMapTex;
var NextX = 0, NextZ = 0;
var floorColors = []; // 存每個地板格子的顏色
var round = 0;
var floorVisible = [];   // 每個地板是否可見
var safeFloors = [];     // 安全地板的索引
var targetColors = []; //目標顏色
var safeFloorPositions = []; //安全地板位置
var roundStartTime = null;
var floorHideDelay = 5000;
var paused = false;
var cubeSize = 1.0;
var gameFinish = false;
var win = false;
var cubemapFbo;                        // 球專用的 cubemap FBO
var offScreenCubeW = 256, offScreenCubeH = 256;
var palying = false;
var useTexture = false;  // true = 貼圖模式, false = 純色模式
var level = 1;           // 當前等級，每 10 round 升一級
var maxLevel = 10;        // 最高等級上限
var texOptions = ["chessTex", "appleTex", "robotTex", "1Tex", "2Tex", "3Tex", "4Tex"];
var absorbedCount = 0;      // 本回合已吸收數量
var maxAbsorb = 4;          // 最多吸收數
var absorbedFloors = [];    // 已被吸收的地板索引（變白色）
var score = 0;              // 總分
var roundScore = 0;         // 本回合分數
var showround = 0;
var pauseStartTime = null;
var mirrorBallActive = false;   // 本 round 是否啟動鏡球
var mirrorBallX = 0;            // 鏡球目前 X 位置
var mirrorBallZ = 0;            // 鏡球目前 Z 位置
var mirrorBallY = 0.5;          // 鏡球懸浮高度（固定）
var mirrorBallVX = 0;   // X 方向速度
var mirrorBallVZ = 0;
var mirrorBallRadius = 0.35;    // 碰撞判定半徑
var lastFrameTime = 0;          // 用於 delta-time 計算
var isDeflecting = false;
var keysPressed = {};
var lastMoveTime = 0;
var moveInterval = 25;
var mirrorBallFirstSpawn = true;
var highestLevel = 1;
var waitingLevelSelect = false;

function generateTargerColors(){
  targetColors = [];
  var rate;
  if(level==3){
    rate = 0.4;
  }else if(level == 4){
    rate = 0.6;
  }else{
    rate = 0.8;
  }
  var textureChance = (level >= 3) ? rate : 0.0;// level 3 40% 
  if (Math.random() < textureChance) {
      // 貼圖模式
      var Tex = texOptions[Math.floor(Math.random() * texOptions.length)];
      targetColors=[Tex];
      useTexture = true;
  } else {
      // 純色模式
      targetColors = [Math.random(), Math.random(), Math.random()];
      useTexture = false;
  }
  
}

function generateFloorColors() {
  floorColors = [];
  floorVisible = [];
  safeFloors = [];
  safeFloorPositions = [];
  const rows = mazeMap.length;
  const cols = mazeMap[0].length;
  var floorCount = 0;
  var floorIdx = 0;
  var floorCoords = [];
  var rate;
  if(level==3){
    rate = 0.2;
  }else if(level == 4){
    rate = 0.4;
  }else{
    rate = 0.6;
  }
  var textureChance = (level >= 3) ? rate : 0.0;
  for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
          if (mazeMap[r][c] === 0) {
            if(Math.random() < textureChance){
              var available = texOptions.filter(t => t !== targetColors[0]);
              var Tex = available[Math.floor(Math.random() * available.length)];
              floorColors.push([Tex]);
            }else{
              var cr, cg, cb;
              do {
                  cr = Math.random();
                  cg = Math.random();
                  cb = Math.random();
              } while (colorTooSimilar(cr, cg, cb)); // 太像就重新抽

              floorColors.push([cr, cg, cb]);
            }
              
              floorVisible.push(true);
              floorCount++;

              let xPos = (c - cols / 2) * cubeSize;
              let zPos = (r - rows / 2) * cubeSize;
              floorCoords.push({x: xPos, z: zPos, idx: floorIdx});
              floorIdx++;
          }
      }
  }

  // 隨機選 5 個安全地板
  var safeCount = 5;
  while (safeFloors.length < safeCount) {
      var idx = Math.floor(Math.random() * floorCount);
      if (!safeFloors.includes(idx)) {
        if (useTexture) {
            floorColors[idx] = [targetColors[0]]; // 存貼圖 key
        } else {
            floorColors[idx] = [targetColors[0], targetColors[1], targetColors[2]];
        }
        safeFloors.push(idx);
        safeFloorPositions.push({x: floorCoords[idx].x, z: floorCoords[idx].z});
          
      }
  }

    // 鏡球：level 5+ 且不是第 0 回合才啟動
  if (level >= 5 && round > 0) {
    mirrorBallActive = true;
    // 從地圖角落隨機生成，與玩家保持距離
    if(mirrorBallFirstSpawn){
      
      var mirrorBallPos;
      do {
          var colus = mazeMap[0].length;
          var row = mazeMap.length;
          var randC = Math.floor(Math.random() * colus);
          var randR = Math.floor(Math.random() * row);
          var cx = (randC - colus / 2) * cubeSize;
          var cz = (randR - row / 2) * cubeSize;
          
          var dx = cx - playerX;
          var dz = cz - playerZ;
          var dist = Math.sqrt(dx*dx + dz*dz);
          
          // 玩家朝向向量
          var rad = playerAngle * Math.PI / 180;
          var forwardX = Math.sin(rad);
          var forwardZ = -Math.cos(rad);
          
          // 計算夾角
          var dot = dist > 0 ? (dx/dist)*forwardX + (dz/dist)*forwardZ : 0;
          var attempts = 0;
          mirrorBallPos = {
              x: cx, z: cz,
              valid: mazeMap[randR][randC] === 0
                  && dist >= 2.0 && dist <= 6.0
                  && dot > 0.3
                  && !checkCollision(cx, mirrorBallY, cz)
                  && !checkCollision(cx + 0.4, mirrorBallY, cz)
                  && !checkCollision(cx - 0.4, mirrorBallY, cz)
                  && !checkCollision(cx, mirrorBallY, cz + 0.4)
                  && !checkCollision(cx, mirrorBallY, cz - 0.4)
          };

          attempts++;
          if (attempts > 500) {
              // 只要是地板且距離夠就行
              mirrorBallPos.valid = mazeMap[randR][randC] === 0 && dist >= 2.0;
          }
      } while (!mirrorBallPos.valid);
      mirrorBallX = mirrorBallPos.x;
      mirrorBallZ = mirrorBallPos.z;
    }
    var angle;
    var rand = Math.random();
    var comeface = 0.05 * (level-5);

    if (mirrorBallFirstSpawn) {
      // 第一次出現
      var awayX = mirrorBallX - playerX;
      var awayZ = mirrorBallZ - playerZ;
      var baseAngle = Math.atan2(awayZ, awayX);
      angle = baseAngle + (Math.random() - 0.5) * (Math.PI / 3);
    }else if (rand < comeface) {
        var toBallX = playerX - mirrorBallX;
        var toBallZ = playerZ - mirrorBallZ;
        var baseAngle = Math.atan2(toBallZ, toBallX);
        angle = baseAngle + (Math.random() - 0.5) * (Math.PI / 6);
    } else if (rand < comeface + (1 - comeface) / 3) {
        var awayX = mirrorBallX - playerX;
        var awayZ = mirrorBallZ - playerZ;
        var baseAngle = Math.atan2(awayZ, awayX);
        angle = baseAngle + (Math.random() - 0.5) * (Math.PI / 3);
    } else {
        angle = Math.random() * Math.PI * 2;
    }
    mirrorBallFirstSpawn = false;
    var spd = 0.025 + (level - 5) * 0.0175; // level 越高越快
    mirrorBallVX = Math.cos(angle) * spd;
    mirrorBallVZ = Math.sin(angle) * spd;
  } else {
    mirrorBallActive = false;
  }

  roundStartTime = performance.now(); // 開始計時
}

function colorTooSimilar(r, g, b) {
  if(r == 1 && g == 1 && b == 1)return true;

  var dr = r - targetColors[0];
  var dg = g - targetColors[1];
  var db = b - targetColors[2];
  var dist = Math.sqrt(dr*dr + dg*dg + db*db);
  return dist < 0.7; // 差距小於??? 就算太像，可自行調整
}


function checkPlayerOnSafeFloor() {
    for (let i = 0; i < safeFloorPositions.length; i++) {
        var sf = safeFloorPositions[i];
        if (playerX >= sf.x - 0.5 && playerX <= sf.x + 0.5 &&
            playerZ >= sf.z - 0.5 && playerZ <= sf.z + 0.5) {
            return true;
        }
    }
    return false;
}

function getStandingSafeFloorIdx() {
  for (let i = 0; i < safeFloorPositions.length; i++) {
    var sf = safeFloorPositions[i];
    if (playerX >= sf.x - 0.5 && playerX <= sf.x + 0.5 &&
        playerZ >= sf.z - 0.5 && playerZ <= sf.z + 0.5) {
        return safeFloors[i]; // 回傳 floorColors 的索引
    }
  }
  return -1;
}

function getPlayerBBox(pX, pY, pZ) {
    return {
        minX: pX - 0.05, maxX: pX + 0.05,
        minY: pY - 0.9,  maxY: pY + 0.9,
        minZ: pZ - 0.05, maxZ: pZ + 0.05
    };
}

async function main(){
    canvas = document.getElementById('webgl');
    gl = canvas.getContext('webgl2');
    if(!gl){
        console.log('Failed to get the rendering context for WebGL');
        return ;
    }

    generateTargerColors();
    generateFloorColors();

    var quad = new Float32Array(
      [
        -1, -1, 1,
         1, -1, 1,
        -1,  1, 1,
        -1,  1, 1,
         1, -1, 1,
         1,  1, 1
      ]); //just a quad

    programEnvCube = compileShader(gl, VSHADER_SOURCE_ENVCUBE, FSHADER_SOURCE_ENVCUBE);
    programEnvCube.a_Position = gl.getAttribLocation(programEnvCube, 'a_Position'); 
    programEnvCube.u_envCubeMap = gl.getUniformLocation(programEnvCube, 'u_envCubeMap'); 
    programEnvCube.u_viewDirectionProjectionInverse = 
               gl.getUniformLocation(programEnvCube, 'u_viewDirectionProjectionInverse'); 

    quadObj = initVertexBufferForLaterUse(gl, quad);

    cubeMapTex = initCubeTexture("pos-x.png", "neg-x.png", "pos-y.png", "neg-y.png", 
                                      "pos-z.png", "neg-z.png", 1536, 1536)

    //setup shaders and prepare shader variables
    shadowProgram = compileShader(gl, VSHADER_SHADOW_SOURCE, FSHADER_SHADOW_SOURCE);
    shadowProgram.a_Position = gl.getAttribLocation(shadowProgram, 'a_Position');
    shadowProgram.u_MvpMatrix = gl.getUniformLocation(shadowProgram, 'u_MvpMatrix');

    program = compileShader(gl, VSHADER_SOURCE, FSHADER_SOURCE);
    
    gl.useProgram(program);
    program.a_Position = gl.getAttribLocation(program, 'a_Position'); 
    program.a_Normal = gl.getAttribLocation(program, 'a_Normal'); 
    program.u_MvpMatrix = gl.getUniformLocation(program, 'u_MvpMatrix'); 
    program.u_modelMatrix = gl.getUniformLocation(program, 'u_modelMatrix'); 
    program.u_normalMatrix = gl.getUniformLocation(program, 'u_normalMatrix');
    program.u_LightPosition = gl.getUniformLocation(program, 'u_LightPosition');
    program.u_ViewPosition = gl.getUniformLocation(program, 'u_ViewPosition');
    program.u_MvpMatrixOfLight = gl.getUniformLocation(program, 'u_MvpMatrixOfLight'); 
    program.u_Ka = gl.getUniformLocation(program, 'u_Ka'); 
    program.u_Kd = gl.getUniformLocation(program, 'u_Kd');
    program.u_Ks = gl.getUniformLocation(program, 'u_Ks');
    program.u_Alpha = gl.getUniformLocation(program, 'u_Alpha');
    program.u_shininess = gl.getUniformLocation(program, 'u_shininess');
    program.u_ShadowMap = gl.getUniformLocation(program, "u_ShadowMap");
    program.u_Color = gl.getUniformLocation(program, 'u_Color'); 
    program.a_TexCoord = gl.getAttribLocation(program, 'a_TexCoord'); 
    program.u_Sampler0 = gl.getUniformLocation(program, 'u_Sampler0'); 
    program.u_UseTexture = gl.getUniformLocation(program, 'u_UseTexture');

    programTextureOnCube = compileShader(gl, VSHADER_SOURCE_TEXTURE_ON_CUBE, FSHADER_SOURCE_TEXTURE_ON_CUBE);
    programTextureOnCube.a_Position = gl.getAttribLocation(programTextureOnCube, 'a_Position'); 
    programTextureOnCube.a_Normal = gl.getAttribLocation(programTextureOnCube, 'a_Normal'); 
    programTextureOnCube.u_MvpMatrix = gl.getUniformLocation(programTextureOnCube, 'u_MvpMatrix'); 
    programTextureOnCube.u_modelMatrix = gl.getUniformLocation(programTextureOnCube, 'u_modelMatrix'); 
    programTextureOnCube.u_normalMatrix = gl.getUniformLocation(programTextureOnCube, 'u_normalMatrix');
    programTextureOnCube.u_ViewPosition = gl.getUniformLocation(programTextureOnCube, 'u_ViewPosition');
    programTextureOnCube.u_envCubeMap = gl.getUniformLocation(programTextureOnCube, 'u_envCubeMap'); 
    programTextureOnCube.u_Color = gl.getUniformLocation(programTextureOnCube, 'u_Color'); 

    response = await fetch('sphere.obj');
    text = await response.text();
    obj = parseOBJ(text);
    for( let i=0; i < obj.geometries.length; i ++ ){
      let o = initVertexBufferForLaterUse(gl, 
                                          obj.geometries[i].data.position,
                                          obj.geometries[i].data.normal, 
                                          obj.geometries[i].data.texcoord);
      sphereObj.push(o);
    }

    response = await fetch('cube.obj');
    text = await response.text();
    obj = parseOBJ(text);
    for( let i=0; i < obj.geometries.length; i ++ ){
      let o = initVertexBufferForLaterUse(gl, 
                                          obj.geometries[i].data.position,
                                          obj.geometries[i].data.normal, 
                                          obj.geometries[i].data.texcoord);
      cubeObj.push(o);
    }

    response = await fetch('Robot.obj');
    text = await response.text();
    obj = parseOBJ(text);
    for( let i=0; i < obj.geometries.length; i ++ ){
      let o = initVertexBufferForLaterUse(gl, 
                                          obj.geometries[i].data.position,
                                          obj.geometries[i].data.normal, 
                                          obj.geometries[i].data.texcoord);
      RobotObj.push(o);
    }


    var imageChess = new Image();
    imageChess.onload = function(){initTexture(gl, imageChess, "chessTex");};
    imageChess.src = "chess.jpg";

    var imageapple = new Image();
    imageapple.onload = function(){initTexture(gl, imageapple, "appleTex");};
    imageapple.src = "apple2.jpg";

    var imagerobot = new Image();
    imagerobot.onload = function(){initTexture(gl, imagerobot, "robotTex");};
    imagerobot.src = "robot.jpg";

    var image1 = new Image();
    image1.onload = function(){initTexture(gl, image1, "1Tex");};
    image1.src = "1.jpg";

    var image2 = new Image();
    image2.onload = function(){initTexture(gl, image2, "2Tex");};
    image2.src = "2.jpg";

    var image3 = new Image();
    image3.onload = function(){initTexture(gl, image3, "3Tex");};
    image3.src = "3.jpg";

    var image4 = new Image();
    image4.onload = function(){initTexture(gl, image4, "4Tex");};
    image4.src = "4.jpg";

    fbo = initFrameBuffer(gl);
    cubemapFbo = initFrameBufferForCubemapRendering(gl);

    canvas.onmousedown = function(ev){mouseDown(ev)};
    canvas.onmousemove = function(ev){mouseMove(ev)};
    canvas.onmouseup = function(ev){mouseUp(ev)};

    document.addEventListener('keydown', (event)=> {
      
      if(paused && event.key !== ' '){
        event.preventDefault(); // 暫停中只允許空白鍵
        return;
      }
      
      if (gameFinish) {
        // 失敗：只允許 Z
        if (!win && event.key !== 'z' && event.key !== 'Z' 
            && !(waitingLevelSelect && (event.key === '0' || (event.key >= '1' && event.key <= '9')))) {
            event.preventDefault();
            return;
        }
        // 勝利：允許 R、Q、Z
        if (win && event.key !== 'r' && event.key !== 'R'
                && event.key !== 'q' && event.key !== 'Q') {
            event.preventDefault();
            return;
        }
      }

      if( event.key == 'a' || event.key == 'A'){ //move triangle1 to the left
          keysPressed['a'] = true;
      }else if ( event.key == 'd' || event.key == 'D'){  //move triangle1 to the right
          keysPressed['d'] = true;
      }else if ( event.key == 's' || event.key == 'S'){ //shorten the second triangle
          keysPressed['s'] = true;
      }else if ( event.key == 'w' || event.key == 'W'){ //shorten the second triangle
          keysPressed['w'] = true;
      }else if ( event.key == 'q' || event.key == 'Q'){  //rotate the second triangle
          console.log('Q')
          if(palying) return;

          if(lookchange==0){
            lookchange=1;
          }
          else{
            lookchange=0;
            angleY = 0;
          }
          draw(gl)
      }else if (event.key == 'r' || event.key == 'R') {
        if (palying && !gameFinish) return;  
        
        if (gameFinish && !checkPlayerOnSafeFloor()) {
              console.log('遊戲已結束，請按Z重開');
              return;
          }
          if(round >= 3){
            round = 0;
          }
          document.getElementById('hint-next-round').style.display = 'none';
          palying = true;
          showround++;
          round++;
          absorbedCount = 0;
          absorbedFloors = [];
          roundScore = 0;
          gameFinish = false;
          win = false;
          lastFrameTime = performance.now();
          generateTargerColors();
          generateFloorColors();
          console.log('Round:', round);
          draw(gl)
      }else if ( event.key == 'e' || event.key == 'E'){ //shorten the second triangle
        if(absorbedCount >= maxAbsorb){
          console.log('已達最大吸收數量');
        }else{
          // 當前站的安全地板索引
          var standingIdx = getStandingSafeFloorIdx();
          if (standingIdx !== -1 && !absorbedFloors.includes(standingIdx)) {
              // 吸收！
              absorbedFloors.push(standingIdx);
              absorbedCount++;

              var pos = safeFloors.indexOf(standingIdx);
              if (pos !== -1) safeFloors.splice(pos, 1);

              // 從 safeFloorPositions 同步移除
              safeFloorPositions.splice(pos, 1);

              if(round>0){
                if(lookchange==1){
                  var bonus = absorbedCount * 10 * level;
                }else{
                  var bonus = absorbedCount * 15 * level;
                }
                score += bonus;
                roundScore += bonus;
                console.log('吸收成功！bonus:', bonus, '總分:', score);
              }
          } else {
            console.log('這裡沒有可吸收的目標地板');
          }
        }
        draw(gl);
      }else if (event.key == ' ') {
          event.preventDefault(); // 防止頁面捲動

          if (!paused) {
              // 暫停
              paused = true;
              pauseStartTime = performance.now();
              document.getElementById('btn-pause').textContent = '▶';
              document.getElementById('pause-overlay').style.display = 'flex';
          } else {
              // 重跑
              paused = false;
              document.getElementById('btn-pause').textContent = '⏸';
              document.getElementById('pause-overlay').style.display = 'none'; 

              // 重置本回合
              absorbedCount = 0;
              absorbedFloors = [];
              roundScore = 0;
              gameFinish = false;
              generateTargerColors();
              generateFloorColors();
              lastFrameTime = performance.now();
          }
          draw();
      }else if(event.key == 'z' || event.key == 'Z'){
        // 只有失敗後才能用Z重開
        if (!gameFinish || win) return;

        if (!waitingLevelSelect) {
          waitingLevelSelect = true;
          // 隱藏第一畫面，顯示第二畫面
          document.getElementById('gameOverScreen').style.display = 'none';
          document.getElementById('levelSelectBox').style.display = 'block';
          document.getElementById('levelSelectHint').textContent = 
              '你最高到達 Level ' + highestLevel;

          var btnContainer = document.getElementById('levelButtons');
          btnContainer.innerHTML = '';
          for (var lv = 1; lv <= highestLevel; lv++) {
              var btn = document.createElement('div');
              btn.textContent = lv;
              btn.style.cssText = 'background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);color:white;border-radius:8px;width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:bold;';
              btnContainer.appendChild(btn);
          }
        }

      }else if (waitingLevelSelect) {
          var chosen = event.key === '0' ? 10 : parseInt(event.key);
          if (isNaN(chosen) || chosen < 1 || chosen > highestLevel) return; // 超過最高關卡不理
          
          // 用選擇的 level 重置
          waitingLevelSelect = false;
          round = 0;
          showround = 0;
          score = 0;
          roundScore = 0;
          level = chosen;
          absorbedCount = 0;
          absorbedFloors = [];
          gameFinish = false;
          win = false;
          playerX = 0; playerY = 1; playerZ = 0;
          playerAngle = 0;
          mirrorBallActive = false;
          mirrorBallFirstSpawn = true;
          lastFrameTime = performance.now();

          document.getElementById('gameOverOverlay').style.display = 'none';
          document.getElementById('gameOverHint').style.display = 'block';
          document.getElementById('gameOverScreen').style.display = 'block';
          document.getElementById('levelSelectBox').style.display = 'none';

          document.getElementById('hint-next-round').textContent = '按 R 繼續';
          document.getElementById('hint-next-round').style.display = 'block';

          generateTargerColors();
          generateFloorColors();
          draw();
      }else if (event.key === 'Shift') {
        event.preventDefault();
        if (!mirrorBallActive || gameFinish || paused) return;
        isDeflecting = true;
      }
    });

    document.addEventListener('keyup', (event) => {
        if (event.key === 'Shift') {
            isDeflecting = false;
        }
        keysPressed[event.key.toLowerCase()] = false;
    });

    canvas.addEventListener('wheel', function(ev) {
        ev.preventDefault(); // 防止頁面跟著滾動

        var temp = gameFinish && !win;

        if(paused || temp) return;
        
        if(ev.deltaY < 0) {
            // 放大
            viewScale += 0.05;
            draw(gl)
        } else {
            //縮小
            console.log('-')
            viewScale -= 0.05;
            if(viewScale<0.1)viewScale=0.1;
            draw(gl)
        }
    });

  function gameLoop() {
    if (!paused) {
        // 處理移動
        var now = performance.now();
        var shouldMove = now - lastMoveTime >= moveInterval;

        if (!isDeflecting && !gameFinish && shouldMove) {
            lastMoveTime = now;
            if (keysPressed['w']) {
                var rad = playerAngle * Math.PI / 180;
                var nx = playerX + Math.sin(rad) * moveSpeed;
                var nz = playerZ - Math.cos(rad) * moveSpeed;
                if (!checkCollision(nx, playerY, playerZ)) playerX = nx;
                if (!checkCollision(playerX, playerY, nz)) playerZ = nz;
            }
            if (keysPressed['s']) {
                var rad = playerAngle * Math.PI / 180;
                var nx = playerX - Math.sin(rad) * moveSpeed;
                var nz = playerZ + Math.cos(rad) * moveSpeed;
                if (!checkCollision(nx, playerY, playerZ)) playerX = nx;
                if (!checkCollision(playerX, playerY, nz)) playerZ = nz;
            }
            if (keysPressed['a']) {
                var rad = (playerAngle - 90) * Math.PI / 180;
                var nx = playerX + Math.sin(rad) * moveSpeed;
                var nz = playerZ - Math.cos(rad) * moveSpeed;
                if (!checkCollision(nx, playerY, playerZ)) playerX = nx;
                if (!checkCollision(playerX, playerY, nz)) playerZ = nz;
            }
            if (keysPressed['d']) {
                var rad = (playerAngle + 90) * Math.PI / 180;
                var nx = playerX + Math.sin(rad) * moveSpeed;
                var nz = playerZ - Math.cos(rad) * moveSpeed;
                if (!checkCollision(nx, playerY, playerZ)) playerX = nx;
                if (!checkCollision(playerX, playerY, nz)) playerZ = nz;
            }
        }
        draw();
    }
    requestAnimationFrame(gameLoop);
  }
  requestAnimationFrame(gameLoop);
}



function draw() {

    let shieldMatrix = null;
    let shieldMvpFromLight = null;


    var ballX1 = mirrorBallActive ? mirrorBallX : 999; // 999 = 場外
    var ballY1 = mirrorBallY;
    var ballZ1 = mirrorBallActive ? mirrorBallZ : 999;
    if (mirrorBallActive) {
      renderCubeMap(ballX1, ballY1, ballZ1);
    }
 
    gl.useProgram(shadowProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, offScreenWidth, offScreenHeight);
    gl.clearColor(0.0, 0.0, 0.0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);


    
    
    let lightMatrix = new Matrix4();//光源
    lightMatrix.setTranslate(lightX, lightY, lightZ);
    lightMatrix.scale(0.1, 0.1, 0.1);
    let lightMvpFromLight = new Matrix4();

    let robotMatrix = new Matrix4();//robot
    robotMatrix.setTranslate(0, 0, 0);
    robotMatrix.translate(0.0, -0.1, 0.0);
    robotMatrix.translate(playerX, 0, playerZ);  // 永遠跟著 player
    robotMatrix.rotate(-playerAngle-90, 0, 1, 0);
    robotMatrix.scale(0.1, 0.1, 0.1);
    let robotMvpFromLight = drawOffScreen(RobotObj, robotMatrix);

    // 畫迷宮 shadow + 收集矩陣
    let wallMatrices = [], wallMvpFromLights = [];
    let wallorground=[];
    const rows = mazeMap.length;
    const cols = mazeMap[0].length;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (mazeMap[r][c] === 1) {//牆壁區域
                let xPos = (c - cols / 2) * cubeSize;
                let yPos = cubeSize / 2;
                let zPos = (r - rows / 2) * cubeSize;

                let wallMatrix = new Matrix4();
                let scalexz=0.5;
                wallMatrix.setTranslate(xPos, yPos-0.5, zPos);
                wallMatrix.scale(scalexz, 0.5, scalexz);

                let mvpFromLight = drawOffScreen(cubeObj, wallMatrix);
                wallMatrices.push(wallMatrix);
                wallMvpFromLights.push(mvpFromLight);
                wallorground.push(1);

                let halfWidth = (cubeSize ) ;//* scalexz
                if (!gameInitialized) {
                    wallList.push({
                        minX: xPos - halfWidth, maxX: xPos + halfWidth,
                        minZ: zPos - halfWidth, maxZ: zPos + halfWidth
                    });
                }
            }
            else{
              let xPos = (c - cols / 2) * cubeSize;
              let yPos = cubeSize / 2;
              let zPos = (r - rows / 2) * cubeSize;

              let wallMatrix = new Matrix4();
              wallMatrix.setTranslate(xPos, yPos, zPos);
              wallMatrix.translate(0, -1,0, 0);
              wallMatrix.scale(0.5, 0.1, 0.5);

              let mvpFromLight = drawOffScreen(cubeObj, wallMatrix);
              wallMatrices.push(wallMatrix);
              wallMvpFromLights.push(mvpFromLight);
              wallorground.push(0);

            }
        }
    }
    gameInitialized = true;

    var cubex = (cols / 2) * cubeSize;
    var cubez = (rows / 2) * cubeSize;
    let cubeMdlMatrix1 = new Matrix4();
    cubeMdlMatrix1.setTranslate(cubex, 1.0, 0.0);
    cubeMdlMatrix1.scale(0.5, 0.5, 0.5);
    let cube1MvpFromLight = drawOffScreen(cubeObj, cubeMdlMatrix1);

    let cubeMdlMatrix2 = new Matrix4();
    cubeMdlMatrix2.setTranslate(-1*cubex-1, 1.0, 0.0);
    cubeMdlMatrix2.scale(0.5, 0.5, 0.5);
    let cube2MvpFromLight = drawOffScreen(cubeObj, cubeMdlMatrix2);

    let cubeMdlMatrix3 = new Matrix4();
    cubeMdlMatrix3.setTranslate(0.0, 1.0, cubez);
    cubeMdlMatrix3.scale(0.5, 0.5, 0.5);
    let cube3MvpFromLight = drawOffScreen(cubeObj, cubeMdlMatrix3);

    let cubeMdlMatrix4 = new Matrix4();
    cubeMdlMatrix4.setTranslate(0.0, 1.0, -1*cubez-1);
    cubeMdlMatrix4.scale(0.5, 0.5, 0.5);
    let cube4MvpFromLight = drawOffScreen(cubeObj, cubeMdlMatrix4);

    if (mirrorBallActive && !paused && !gameFinish && round > 0) {
      var now2 = performance.now();
      var dt = Math.min((now2 - lastFrameTime) / 16.67, 3);
      lastFrameTime = now2;

      // 移動
      var nextX = mirrorBallX + mirrorBallVX * dt;
      var nextZ = mirrorBallZ + mirrorBallVZ * dt;

      if (checkCollision(nextX, mirrorBallY, mirrorBallZ)) {
          mirrorBallVX *= -1;
          nextX = mirrorBallX + mirrorBallVX * dt;
      }
      if (checkCollision(nextX, mirrorBallY, nextZ)) {
          mirrorBallVZ *= -1;
          nextZ = mirrorBallZ + mirrorBallVZ * dt;
      }

      mirrorBallX = nextX;
      mirrorBallZ = nextZ;

      var dx = playerX - mirrorBallX;
      var dz = playerZ - mirrorBallZ;
      var dist = Math.sqrt(dx*dx + dz*dz);

      if (dist < mirrorBallRadius + 0.5) {
          if (isDeflecting) {
                var nx = (mirrorBallX - playerX) / dist;
                var nz = (mirrorBallZ - playerZ) / dist;
                // 速度投影到法線上並反轉
                var dot = mirrorBallVX * nx + mirrorBallVZ * nz;
                mirrorBallVX -= 2 * dot * nx;
                mirrorBallVZ -= 2 * dot * nz;
          } else if (!gameFinish && dist < mirrorBallRadius + 0.3) {
              gameFinish = true;
              win = false;
              palying = false;
              roundStartTime = -Infinity;
              document.getElementById('gameOverOverlay').style.display = 'flex';
              document.getElementById('finalScore').textContent = score;
              console.log('鏡球碰到玩家！遊戲結束');
          }
      }
    } else if (!paused) {
        lastFrameTime = performance.now();
    }

    if (isDeflecting && mirrorBallActive) {
      shieldMatrix = new Matrix4();
      shieldMatrix.setTranslate(playerX, playerY, playerZ);
      shieldMatrix.translate(0.0, -0.8, 0.0);
      shieldMatrix.scale(0.25, 0.25, 0.25);
      shieldMvpFromLight = drawOffScreen(sphereObj, shieldMatrix);
    }

    // === On-Screen Pass ===
    gl.useProgram(program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.4, 0.4, 0.4, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    if (mirrorBallActive) {
      let ballMdlMatrix1 = new Matrix4();
      ballMdlMatrix1.setTranslate(ballX1, ballY1, ballZ1);
      ballMdlMatrix1.scale(0.2, 0.2, 0.2);
      drawObjectWithDynamicReflection(sphereObj, ballMdlMatrix1, 0.95, 0.85, 0.4);
    }
    // 目標展示方塊們
    var t = targetColors;
    if(!useTexture){
      drawOneObjectOnScreen(cubeObj, cubeMdlMatrix1, cube1MvpFromLight, t[0], t[1], t[2], null, true, 1.0);
      drawOneObjectOnScreen(cubeObj, cubeMdlMatrix2, cube2MvpFromLight, t[0], t[1], t[2], null, true, 1.0);
      drawOneObjectOnScreen(cubeObj, cubeMdlMatrix3, cube3MvpFromLight, t[0], t[1], t[2], null, true, 1.0);
      drawOneObjectOnScreen(cubeObj, cubeMdlMatrix4, cube4MvpFromLight, t[0], t[1], t[2], null, true, 1.0);
    }else{
      drawOneObjectOnScreen(cubeObj, cubeMdlMatrix1, cube1MvpFromLight, 0.0, 0.0, 0.0, t[0], true, 1.0);
      drawOneObjectOnScreen(cubeObj, cubeMdlMatrix2, cube2MvpFromLight, 0.0, 0.0, 0.0, t[0], true, 1.0);
      drawOneObjectOnScreen(cubeObj, cubeMdlMatrix3, cube3MvpFromLight, 0.0, 0.0, 0.0, t[0], true, 1.0);
      drawOneObjectOnScreen(cubeObj, cubeMdlMatrix4, cube4MvpFromLight, 0.0, 0.0, 0.0, t[0], true, 1.0);
    }

    drawOneObjectOnScreen(cubeObj, lightMatrix, lightMvpFromLight, 0.0, 0.0, 0.0, null, false, 1.0);//光點


    drawOneObjectOnScreen(RobotObj, robotMatrix, robotMvpFromLight, 0.0, 0.0, 0.0, "robotTex", true, 1.0);//robot
    // 畫迷宮
    var floorIdx = 0;
    var now = paused ? pauseStartTime : performance.now();
    var elapsed = now - roundStartTime;
    
    for (let i = 0; i < wallMatrices.length; i++) {
      if(wallorground[i]==1){
        drawOneObjectOnScreen(cubeObj, wallMatrices[i], wallMvpFromLights[i], 1.0, 1.0, 1.0, null, true, 1.0);
      }
      else{
        var isSafe = safeFloors.includes(floorIdx);
        var isAbsorbed = absorbedFloors.includes(floorIdx);
        if (round == 0 || elapsed < floorHideDelay) {
          if (isAbsorbed) {
            // 已吸收白色
            drawOneObjectOnScreen(cubeObj, wallMatrices[i], wallMvpFromLights[i], 1.0, 1.0, 1.0, null, true, 1.0);
          }else{
            // 時間還沒到，全部正常顯示
            var c = floorColors[floorIdx];
            var isTexFloor = (c.length === 1 && typeof c[0] === 'string');
            if(isTexFloor){
              drawOneObjectOnScreen(cubeObj, wallMatrices[i], wallMvpFromLights[i], 0.0, 0.0, 0.0, c[0], true, 1.0);
            }else{
              drawOneObjectOnScreen(cubeObj, wallMatrices[i], wallMvpFromLights[i], c[0], c[1], c[2], null, true, 1.0);
            }
          }
        } else if (isSafe) {
            // 安全地板，保持原色
            var c = floorColors[floorIdx];
            var isTexFloor = (c.length === 1 && typeof c[0] === 'string');
            if(isTexFloor){
              drawOneObjectOnScreen(cubeObj, wallMatrices[i], wallMvpFromLights[i], 0.0, 0.0, 0.0, c[0], true, 1.0);
            }else{
              drawOneObjectOnScreen(cubeObj, wallMatrices[i], wallMvpFromLights[i], c[0], c[1], c[2], null, true, 1.0);
            }

        }

        floorIdx++;
      }
        
    }

 

    if (!gameFinish && !win && round > 0 && elapsed >= floorHideDelay) {
      palying = false;
      if (!checkPlayerOnSafeFloor()) {
          gameFinish = true;
          win = false;
          console.log('玩家落下！遊戲結束');
          document.getElementById('gameOverOverlay').style.display = 'flex';
          document.getElementById('finalScore').textContent = score;
          // game over 邏輯
      }else{
        gameFinish = true;
        win = true;
        document.getElementById('hint-next-round').style.display = 'block';
        if(lookchange == 1){
          score += 10 * level;
        }else{
          score += 15 * level;
        }
        
        if(round >=3 ){
          if (level < maxLevel) {
            level++;
            if (level > highestLevel) {
              highestLevel = level;
            }
            showround=0;
            score += 100 * level;
            console.log('Level Up! 現在是 Level:', level);
          }
        }
        console.log('玩家存活！按R可繼續遊戲');
      }
    }

    if (isDeflecting && mirrorBallActive && shieldMatrix) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        drawOneObjectOnScreen(sphereObj, shieldMatrix, shieldMvpFromLight, 0.5, 0.8, 1.0, null, true, 0.4);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
    }


    var vpFromCamera = new Matrix4();
    var viewMatrixRotationOnly = new Matrix4();

    if (lookchange == 1) {
        var rad = playerAngle * Math.PI / 180;
        var camX = playerX - Math.sin(rad) * 2;
        var camY = playerY + 1;
        var camZ = playerZ + Math.cos(rad) * 2;

        vpFromCamera.setPerspective(60, 1, 1, 50);
        viewMatrixRotationOnly.lookAt(
            camX, camY, camZ,
            playerX, playerY, playerZ,
            0, 1, 0
        );
    } else {
        // 第一人稱
        var rad = playerAngle * Math.PI / 180;
        var pitchRad = angleY * Math.PI / 180;
        var lookX = playerX + Math.cos(pitchRad) * Math.sin(rad);
        var lookY = playerY + Math.sin(pitchRad);
        var lookZ = playerZ - Math.cos(pitchRad) * Math.cos(rad);

        vpFromCamera.setPerspective(60, 1, 1, 50);
        viewMatrixRotationOnly.lookAt(
            playerX, playerY, playerZ,
            lookX, lookY, lookZ,
            0, 1, 0
        );
    }
    viewMatrixRotationOnly.elements[12] = 0;
    viewMatrixRotationOnly.elements[13] = 0;
    viewMatrixRotationOnly.elements[14] = 0;
    vpFromCamera.multiply(viewMatrixRotationOnly);
    var vpFromCameraInverse = vpFromCamera.invert();
    //quad
    gl.useProgram(programEnvCube);
    gl.depthFunc(gl.LEQUAL);
    gl.uniformMatrix4fv(programEnvCube.u_viewDirectionProjectionInverse, 
                        false, vpFromCameraInverse.elements);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubeMapTex);
    gl.uniform1i(programEnvCube.u_envCubeMap, 0);
    initAttributeVariable(gl, programEnvCube.a_Position, quadObj.vertexBuffer);
    gl.drawArrays(gl.TRIANGLES, 0, quadObj.numVertices);
    
    if (showround == 0) {
      document.getElementById('timeDisplay').textContent = '0.00';
    } else {
      var now = paused ? pauseStartTime : performance.now();
      var elapsed = now - roundStartTime;
      var remaining = Math.max(0, (floorHideDelay - elapsed) / 1000);
      document.getElementById('timeDisplay').textContent = remaining.toFixed(2);
    }
    document.getElementById('scoreDisplay').textContent = score;
    document.getElementById('levelDisplay').textContent = level;
    document.getElementById('roundDisplay').textContent = showround;
}

function drawOffScreen(obj, mdlMatrix){
  var mvpFromLight = new Matrix4();
  //model Matrix (part of the mvp matrix)
  let modelMatrix = new Matrix4();
  modelMatrix.setIdentity();
  modelMatrix.multiply(mdlMatrix);

  mvpFromLight.setOrtho(-8, 8, -8, 8, 0.1, 20);
  mvpFromLight.lookAt(lightX, lightY, lightZ,
                      lightX, 0, lightZ,   // 垂直向下看
                      0, 0, -1);           
  mvpFromLight.multiply(modelMatrix);

  gl.uniformMatrix4fv(shadowProgram.u_MvpMatrix, false, mvpFromLight.elements);

  for( let i=0; i < obj.length; i ++ ){
    initAttributeVariable(gl, shadowProgram.a_Position, obj[i].vertexBuffer);
    gl.drawArrays(gl.TRIANGLES, 0, obj[i].numVertices);
  }

  return mvpFromLight;
}

//obj: the object components
//mdlMatrix: the model matrix without mouse rotation
//colorR, G, B: object color
function drawOneObjectOnScreen(obj, mdlMatrix, mvpFromLight, colorR, colorG, colorB, texKey, applyRotation, alpha){
  gl.useProgram(program);
  var mvpFromCamera = new Matrix4();
  //model Matrix (part of the mvp matrix)
  let modelMatrix = new Matrix4();
  if(lookchange==1){
    modelMatrix.setIdentity();
    modelMatrix.multiply(mdlMatrix);

    var rad = playerAngle * Math.PI / 180;
    var pitchRad = angleY * Math.PI / 180;

    // 相機在玩家後方2、上方1
    var camX = playerX - Math.sin(rad) * 2;
    var camY = playerY + 1;
    var camZ = playerZ + Math.cos(rad) * 2;

    mvpFromCamera.setPerspective(60/viewScale, 1, 1, 50);
    mvpFromCamera.lookAt(
        camX, camY, camZ,
        playerX, playerY, playerZ,
        0, 1, 0
    );
    mvpFromCamera.multiply(modelMatrix);
  }
  else{
    modelMatrix.setIdentity();
    modelMatrix.multiply(mdlMatrix);

    // 用 playerAngle 和滑鼠 angleY計算目標點
    var rad = playerAngle * Math.PI / 180;
    var pitchRad = angleY * Math.PI / 180;  // 上下視角

    var eyeX = playerX + Math.sin(rad) * 0.2;
    var eyeY = playerY - 0.2;
    var eyeZ = playerZ - Math.cos(rad) * 0.2;
    var lookX = eyeX + Math.cos(pitchRad) * Math.sin(rad);
    var lookY = eyeY + Math.sin(pitchRad);
    var lookZ = eyeZ - Math.cos(pitchRad) * Math.cos(rad);
    //mvp: projection * view * model matrix  
    mvpFromCamera.setPerspective(60/viewScale, 1, 0.1, 50);
    mvpFromCamera.lookAt(eyeX, eyeY, eyeZ, lookX, lookY, lookZ, 0, 1, 0);
    mvpFromCamera.multiply(modelMatrix);
  }

  //normal matrix
  let normalMatrix = new Matrix4();
  normalMatrix.setInverseOf(modelMatrix);
  normalMatrix.transpose();

  gl.uniform3f(program.u_LightPosition, lightX, lightY, lightZ);
  if(lookchange==1){
    gl.uniform3f(program.u_ViewPosition, cameraX, cameraY, cameraZ);
  }else{
    gl.uniform3f(program.u_ViewPosition, playerX, playerY, playerZ);
  }
  
  gl.uniform1f(program.u_Ka, 0.2);
  gl.uniform1f(program.u_Kd, 0.7);
  gl.uniform1f(program.u_Ks, 0.5);
  gl.uniform1f(program.u_Alpha, alpha);
  gl.uniform1f(program.u_shininess, 10.0);
  gl.uniform1i(program.u_ShadowMap, 0);
  gl.uniform1i(program.u_Sampler0, 1);
  //gl.uniform3f(program.u_Color, colorR, colorG, colorB);

  gl.uniformMatrix4fv(program.u_MvpMatrix, false, mvpFromCamera.elements);
  gl.uniformMatrix4fv(program.u_modelMatrix, false, modelMatrix.elements);
  gl.uniformMatrix4fv(program.u_normalMatrix, false, normalMatrix.elements);
  gl.uniformMatrix4fv(program.u_MvpMatrixOfLight, false, mvpFromLight.elements);

  gl.activeTexture(gl.TEXTURE0);   
  gl.bindTexture(gl.TEXTURE_2D, fbo.texture); 

  if (texKey && textures[texKey]) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, textures[texKey]);
      gl.uniform1i(program.u_UseTexture, 1);
  } else {
      gl.uniform1i(program.u_UseTexture, 0);
      gl.uniform3f(program.u_Color, colorR, colorG, colorB);
  }

  for( let i=0; i < obj.length; i ++ ){
    initAttributeVariable(gl, program.a_Position, obj[i].vertexBuffer);
    initAttributeVariable(gl, program.a_Normal, obj[i].normalBuffer);
    if (obj[i].texCoordBuffer) {
          initAttributeVariable(gl, program.a_TexCoord, obj[i].texCoordBuffer); 
    }
    gl.drawArrays(gl.TRIANGLES, 0, obj[i].numVertices);
  }
}

function drawObjectWithDynamicReflection(obj, modelMatrix, colorR, colorG, colorB){
  gl.useProgram(programTextureOnCube);

  let mvpMatrix = new Matrix4();
  let normalMatrix = new Matrix4();

  if (lookchange == 1) {
      var rad = playerAngle * Math.PI / 180;
      var camX = playerX - Math.sin(rad) * 2;
      var camY = playerY + 1;
      var camZ = playerZ + Math.cos(rad) * 2;
      mvpMatrix.setPerspective(60 / viewScale, 1, 1, 50);
      mvpMatrix.lookAt(camX, camY, camZ, playerX, playerY, playerZ, 0, 1, 0);
      gl.uniform3f(programTextureOnCube.u_ViewPosition, camX, camY, camZ);
  } else {
      var rad = playerAngle * Math.PI / 180;
      var pitchRad = angleY * Math.PI / 180;
      var eyeX = playerX + Math.sin(rad) * 0.2;
      var eyeY = playerY - 0.2;
      var eyeZ = playerZ - Math.cos(rad) * 0.2;
      var lookX = eyeX + Math.cos(pitchRad) * Math.sin(rad);
      var lookY = eyeY + Math.sin(pitchRad);
      var lookZ = eyeZ - Math.cos(pitchRad) * Math.cos(rad);
      mvpMatrix.setPerspective(60 / viewScale, 1, 0.1, 50);
      mvpMatrix.lookAt(eyeX, eyeY, eyeZ, lookX, lookY, lookZ, 0, 1, 0);
      gl.uniform3f(programTextureOnCube.u_ViewPosition, eyeX, eyeY, eyeZ);
  }

  mvpMatrix.multiply(modelMatrix);

  normalMatrix.setInverseOf(modelMatrix);
  normalMatrix.transpose();

  gl.uniform3f(programTextureOnCube.u_Color, colorR, colorG, colorB);
  gl.uniformMatrix4fv(programTextureOnCube.u_MvpMatrix,    false, mvpMatrix.elements);
  gl.uniformMatrix4fv(programTextureOnCube.u_modelMatrix,  false, modelMatrix.elements);
  gl.uniformMatrix4fv(programTextureOnCube.u_normalMatrix, false, normalMatrix.elements);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubemapFbo.texture);
  gl.uniform1i(programTextureOnCube.u_envCubeMap, 0);

  for (let i = 0; i < obj.length; i++) {
      initAttributeVariable(gl, programTextureOnCube.a_Position, obj[i].vertexBuffer);
      initAttributeVariable(gl, programTextureOnCube.a_Normal,   obj[i].normalBuffer);
      gl.drawArrays(gl.TRIANGLES, 0, obj[i].numVertices);
  }
}

function parseOBJ(text) {
  // because indices are base 1 let's just fill in the 0th data
  const objPositions = [[0, 0, 0]];
  const objTexcoords = [[0, 0]];
  const objNormals = [[0, 0, 0]];

  // same order as `f` indices
  const objVertexData = [
    objPositions,
    objTexcoords,
    objNormals,
  ];

  // same order as `f` indices
  let webglVertexData = [
    [],   // positions
    [],   // texcoords
    [],   // normals
  ];

  const materialLibs = [];
  const geometries = [];
  let geometry;
  let groups = ['default'];
  let material = 'default';
  let object = 'default';

  const noop = () => {};

  function newGeometry() {
    // If there is an existing geometry and it's
    // not empty then start a new one.
    if (geometry && geometry.data.position.length) {
      geometry = undefined;
    }
  }

  function setGeometry() {
    if (!geometry) {
      const position = [];
      const texcoord = [];
      const normal = [];
      webglVertexData = [
        position,
        texcoord,
        normal,
      ];
      geometry = {
        object,
        groups,
        material,
        data: {
          position,
          texcoord,
          normal,
        },
      };
      geometries.push(geometry);
    }
  }

  function addVertex(vert) {
    const ptn = vert.split('/');
    ptn.forEach((objIndexStr, i) => {
      if (!objIndexStr) {
        return;
      }
      const objIndex = parseInt(objIndexStr);
      const index = objIndex + (objIndex >= 0 ? 0 : objVertexData[i].length);
      webglVertexData[i].push(...objVertexData[i][index]);
    });
  }

  const keywords = {
    v(parts) {
      objPositions.push(parts.map(parseFloat));
    },
    vn(parts) {
      objNormals.push(parts.map(parseFloat));
    },
    vt(parts) {
      // should check for missing v and extra w?
      objTexcoords.push(parts.map(parseFloat));
    },
    f(parts) {
      setGeometry();
      const numTriangles = parts.length - 2;
      for (let tri = 0; tri < numTriangles; ++tri) {
        addVertex(parts[0]);
        addVertex(parts[tri + 1]);
        addVertex(parts[tri + 2]);
      }
    },
    s: noop,    // smoothing group
    mtllib(parts, unparsedArgs) {
      // the spec says there can be multiple filenames here
      // but many exist with spaces in a single filename
      materialLibs.push(unparsedArgs);
    },
    usemtl(parts, unparsedArgs) {
      material = unparsedArgs;
      newGeometry();
    },
    g(parts) {
      groups = parts;
      newGeometry();
    },
    o(parts, unparsedArgs) {
      object = unparsedArgs;
      newGeometry();
    },
  };

  const keywordRE = /(\w*)(?: )*(.*)/;
  const lines = text.split('\n');
  for (let lineNo = 0; lineNo < lines.length; ++lineNo) {
    const line = lines[lineNo].trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const m = keywordRE.exec(line);
    if (!m) {
      continue;
    }
    const [, keyword, unparsedArgs] = m;
    const parts = line.split(/\s+/).slice(1);
    const handler = keywords[keyword];
    if (!handler) {
      console.warn('unhandled keyword:', keyword);  // eslint-disable-line no-console
      continue;
    }
    handler(parts, unparsedArgs);
  }

  // remove any arrays that have no entries.
  for (const geometry of geometries) {
    geometry.data = Object.fromEntries(
        Object.entries(geometry.data).filter(([, array]) => array.length > 0));
  }

  return {
    geometries,
    materialLibs,
  };
}

function mouseDown(ev){ 
    var x = ev.clientX;
    var y = ev.clientY;
    var rect = ev.target.getBoundingClientRect();
    if( rect.left <= x && x < rect.right && rect.top <= y && y < rect.bottom){
        mouseLastX = x;
        mouseLastY = y;
        mouseDragging = true;
    }
}

function mouseUp(ev){ 
    mouseDragging = false;
}

function mouseMove(ev){ 
  var x = ev.clientX;
  var y = ev.clientY;
  var temp = !gameFinish || win;
  if(mouseDragging && !paused && temp){
      var factor = 0.3;
      var dx = factor * (x - mouseLastX);
      var dy = factor * (y - mouseLastY);
      playerAngle += dx;   // 左右轉
      angleY += dy;        // 上下看
      if(angleY > 89) angleY = 89;
      if(angleY < -89) angleY = -89;
  }
  mouseLastX = x;
  mouseLastY = y;
  if(!paused && temp) draw();
}

function initFrameBuffer(gl){
  //create and set up a texture object as the color buffer
  var texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, offScreenWidth, offScreenHeight,
                  0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  

  //create and setup a render buffer as the depth buffer
  var depthBuffer = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, 
                          offScreenWidth, offScreenHeight);

  //create and setup framebuffer: linke the color and depth buffer to it
  var frameBuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, 
                            gl.TEXTURE_2D, texture, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, 
                              gl.RENDERBUFFER, depthBuffer);
  frameBuffer.texture = texture;
  return frameBuffer;
}

function initTexture(gl, img, texKey){
  var tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);

  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  // Set the parameters so we can render any size image.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  // Upload the image into the texture.
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

  textures[texKey] = tex;

  texCount++;
  if( texCount == numTextures){
    draw();
  }
}

function initCubeTexture(posXName, negXName, posYName, negYName, 
                         posZName, negZName, imgWidth, imgHeight)
{
  var texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);

  const faceInfos = [
    {
      target: gl.TEXTURE_CUBE_MAP_POSITIVE_X,
      fName: posXName,
    },
    {
      target: gl.TEXTURE_CUBE_MAP_NEGATIVE_X,
      fName: negXName,
    },
    {
      target: gl.TEXTURE_CUBE_MAP_POSITIVE_Y,
      fName: posYName,
    },
    {
      target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Y,
      fName: negYName,
    },
    {
      target: gl.TEXTURE_CUBE_MAP_POSITIVE_Z,
      fName: posZName,
    },
    {
      target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Z,
      fName: negZName,
    },
  ];
  var loadedCount = 0;  // 計數器

  faceInfos.forEach((faceInfo) => {
      const { target, fName } = faceInfo;
      gl.texImage2D(target, 0, gl.RGBA, imgWidth, imgHeight, 0,
                    gl.RGBA, gl.UNSIGNED_BYTE, null);

      var image = new Image();
      image.onload = function() {
          gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
          gl.texImage2D(target, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
          
          loadedCount++;
          if (loadedCount === 6) {
              gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
              gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
          }
      };
      image.src = fName;
  });

  return texture;
}

function checkCollision(nx, ny, nz) {
    var bbox = getPlayerBBox(nx, ny, nz);
    
    for (let i = 0; i < wallList.length; i++) {
        var w = wallList[i];
        // AABB 碰撞檢查
        if (bbox.maxX > w.minX && bbox.minX < w.maxX &&
            bbox.maxZ > w.minZ && bbox.minZ < w.maxZ) {
            return true; // 有碰牆
        }
    }
    return false; // 沒碰
}


function initFrameBufferForCubemapRendering(gl){
  var texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);

  // 6 2D textures
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  for (let i = 0; i < 6; i++) {
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, 
                  gl.RGBA, offScreenCubeW, offScreenCubeH, 0, gl.RGBA, 
                  gl.UNSIGNED_BYTE, null);
  }

  //create and setup a render buffer as the depth buffer
  var depthBuffer = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, 
                          offScreenCubeW, offScreenCubeH);

  //create and setup framebuffer: linke the depth buffer to it (no color buffer here)
  var frameBuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, 
                              gl.RENDERBUFFER, depthBuffer);

  frameBuffer.texture = texture;

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return frameBuffer;
}

function renderCubeMap(camX, camY, camZ)
{
  //camera 6 direction to render 6 cubemap faces
  var ENV_CUBE_LOOK_DIR = [
      [1.0, 0.0, 0.0],
      [-1.0, 0.0, 0.0],
      [0.0, 1.0, 0.0],
      [0.0, -1.0, 0.0],
      [0.0, 0.0, 1.0],
      [0.0, 0.0, -1.0]
  ];

  //camera 6 look up vector to render 6 cubemap faces
  var ENV_CUBE_LOOK_UP = [
      [0.0, -1.0, 0.0],
      [0.0, -1.0, 0.0],
      [0.0, 0.0, 1.0],
      [0.0, 0.0, -1.0],
      [0.0, -1.0, 0.0],
      [0.0, -1.0, 0.0]
  ];

  

  gl.useProgram(program);
  gl.bindFramebuffer(gl.FRAMEBUFFER, cubemapFbo);
  gl.viewport(0, 0, offScreenCubeW, offScreenCubeH);
  gl.clearColor(0.4, 0.4, 0.4,1);
  for (var side = 0; side < 6; side++) {
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                            gl.TEXTURE_CUBE_MAP_POSITIVE_X + side,
                            cubemapFbo.texture, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    let vpMatrix = new Matrix4();
    vpMatrix.setPerspective(90, 1, 0.1, 100);  // near 從 1 改成 0.1
    vpMatrix.lookAt(
        camX, camY, camZ,
        camX + ENV_CUBE_LOOK_DIR[side][0],
        camY + ENV_CUBE_LOOK_DIR[side][1],
        camZ + ENV_CUBE_LOOK_DIR[side][2],
        ENV_CUBE_LOOK_UP[side][0],
        ENV_CUBE_LOOK_UP[side][1],
        ENV_CUBE_LOOK_UP[side][2]
    );

    var dummyMvp = new Matrix4();

    // ── Robot ──
    let robotMatrix = new Matrix4();
    robotMatrix.setTranslate(playerX, 0, playerZ);
    robotMatrix.translate(0.0, -0.1, 0.0);
    robotMatrix.rotate(-playerAngle - 90, 0, 1, 0);
    robotMatrix.scale(0.1, 0.1, 0.1);
    drawOneObjectWithVP(RobotObj, robotMatrix, dummyMvp, vpMatrix, 1, 1, 1, "robotTex");

    // ── 地板 ──
    const rows = mazeMap.length;
    const cols = mazeMap[0].length;
    var floorIdx = 0;
    var now = paused ? pauseStartTime : performance.now();
    var elapsed = now - roundStartTime;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (mazeMap[r][c] === 0) {
                let xPos = (c - cols/2) * cubeSize;
                let zPos = (r - rows/2) * cubeSize;
                let floorMatrix = new Matrix4();
                floorMatrix.setTranslate(xPos, 0, zPos);
                floorMatrix.translate(0, -1, 0);
                floorMatrix.scale(0.5, 0.1, 0.5);

                var isSafe = safeFloors.includes(floorIdx);
                var c3 = floorColors[floorIdx] || [0.5, 0.5, 0.5];

                if (round == 0 || elapsed < floorHideDelay || isSafe) {
                    var isTexFloor = (c3.length === 1 && typeof c3[0] === 'string');
                    if (isTexFloor) {
                        drawOneObjectWithVP(cubeObj, floorMatrix, dummyMvp, vpMatrix,
                                            0.0, 0.0, 0.0, c3[0]);
                    } else {
                        drawOneObjectWithVP(cubeObj, floorMatrix, dummyMvp, vpMatrix,
                                            c3[0], c3[1], c3[2], null);
                    }
                }
                floorIdx++;
            }
        }
    }

    // 目標展示方塊
    var cubex = (cols / 2) * cubeSize;
    var cubez = (rows / 2) * cubeSize;
    var t = targetColors;
    var cornerMatrices = [
        (() => { let m = new Matrix4(); m.setTranslate(cubex, 1.0, 0.0); m.scale(0.5,0.5,0.5); return m; })(),
        (() => { let m = new Matrix4(); m.setTranslate(-cubex-1, 1.0, 0.0); m.scale(0.5,0.5,0.5); return m; })(),
        (() => { let m = new Matrix4(); m.setTranslate(0.0, 1.0, cubez); m.scale(0.5,0.5,0.5); return m; })(),
        (() => { let m = new Matrix4(); m.setTranslate(0.0, 1.0, -cubez-1); m.scale(0.5,0.5,0.5); return m; })(),
    ];
    for (let cm of cornerMatrices) {
        if (!useTexture) {
            drawOneObjectWithVP(cubeObj, cm, dummyMvp, vpMatrix, t[0], t[1], t[2], null);
        } else {
            drawOneObjectWithVP(cubeObj, cm, dummyMvp, vpMatrix, 0.0, 0.0, 0.0, t[0]);
        }
    }

    // 牆壁 
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (mazeMap[r][c] === 1) {
                let xPos = (c - cols/2) * cubeSize;
                let zPos = (r - rows/2) * cubeSize;
                let wallMatrix = new Matrix4();
                wallMatrix.setTranslate(xPos, 0, zPos);
                wallMatrix.scale(0.5, 0.5, 0.5);
                drawOneObjectWithVP(cubeObj, wallMatrix, dummyMvp, vpMatrix, 1.0, 1.0, 1.0, null);
            }
        }
    }

    // ── Skybox ──
    // skybox 需要 rotation-only 的 VP inverse
    var vpForSky = new Matrix4();
    vpForSky.setPerspective(90, 1, 0.1, 100);
    var viewRotOnly = new Matrix4();
    viewRotOnly.lookAt(
        camX, camY, camZ,
        camX + ENV_CUBE_LOOK_DIR[side][0],
        camY + ENV_CUBE_LOOK_DIR[side][1],
        camZ + ENV_CUBE_LOOK_DIR[side][2],
        ENV_CUBE_LOOK_UP[side][0],
        ENV_CUBE_LOOK_UP[side][1],
        ENV_CUBE_LOOK_UP[side][2]
    );
    viewRotOnly.elements[12] = 0;
    viewRotOnly.elements[13] = 0;
    viewRotOnly.elements[14] = 0;
    vpForSky.multiply(viewRotOnly);
    var vpForSkyInverse = vpForSky.invert();

    gl.useProgram(programEnvCube);
    gl.depthFunc(gl.LEQUAL);
    gl.uniformMatrix4fv(programEnvCube.u_viewDirectionProjectionInverse,
                        false, vpForSkyInverse.elements);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubeMapTex);
    gl.uniform1i(programEnvCube.u_envCubeMap, 0);
    initAttributeVariable(gl, programEnvCube.a_Position, quadObj.vertexBuffer);
    gl.drawArrays(gl.TRIANGLES, 0, quadObj.numVertices);
    gl.depthFunc(gl.LESS); 
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function drawOneObjectWithVP(obj, mdlMatrix, mvpFromLight, vpMatrix, colorR, colorG, colorB, texKey) {
    gl.useProgram(program);

    let modelMatrix = new Matrix4();
    modelMatrix.setIdentity();
    modelMatrix.multiply(mdlMatrix);

    var mvpFromCamera = new Matrix4();
    mvpFromCamera.set(vpMatrix);
    mvpFromCamera.multiply(modelMatrix);

    let normalMatrix = new Matrix4();
    normalMatrix.setInverseOf(modelMatrix);
    normalMatrix.transpose();

    gl.uniform3f(program.u_LightPosition, lightX, lightY, lightZ);
    gl.uniform3f(program.u_ViewPosition, playerX, playerY, playerZ);
    gl.uniform1f(program.u_Ka, 0.5); // ambient 拉高
    gl.uniform1f(program.u_Kd, 0.7);
    gl.uniform1f(program.u_Ks, 0.5);
    gl.uniform1f(program.u_Alpha, 1.0);
    gl.uniform1f(program.u_shininess, 10.0);
    gl.uniform1i(program.u_ShadowMap, 0);
    gl.uniform1i(program.u_Sampler0, 1);

    gl.uniformMatrix4fv(program.u_MvpMatrix,        false, mvpFromCamera.elements);
    gl.uniformMatrix4fv(program.u_modelMatrix,      false, modelMatrix.elements);
    gl.uniformMatrix4fv(program.u_normalMatrix,     false, normalMatrix.elements);
    gl.uniformMatrix4fv(program.u_MvpMatrixOfLight, false, mvpFromLight.elements);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fbo.texture);

    if (texKey && textures[texKey]) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, textures[texKey]);
        gl.uniform1i(program.u_UseTexture, 1);
    } else {
        gl.uniform1i(program.u_UseTexture, 0);
        gl.uniform3f(program.u_Color, colorR, colorG, colorB);
    }

    for (let i = 0; i < obj.length; i++) {
        initAttributeVariable(gl, program.a_Position, obj[i].vertexBuffer);
        initAttributeVariable(gl, program.a_Normal,   obj[i].normalBuffer);
        if (obj[i].texCoordBuffer)
            initAttributeVariable(gl, program.a_TexCoord, obj[i].texCoordBuffer);
        gl.drawArrays(gl.TRIANGLES, 0, obj[i].numVertices);
    }
}