
var database = {
}
//Docker Server Logic - STARTUP
var Docker = require("dockerode");
var docker = new Docker({socketPath: '/var/run/docker.sock'});
var getOptionsFromInspect = function(data){
    var env = data.Config.Env;
    var options = {
        "Id":data.Id,
        "Env":{},
        "IP":data.NetworkSettings.IPAddress
    };
    for(e in env){
        var n = env[e].split('=');
        options.Env[n[0]] = n[1];
    }
    return options;
}
var checkContainerAndAdd = function(cid){
    docker.getContainer(cid).inspect(function (err, data) {
        var o = getOptionsFromInspect(data);
        if(o.Env.VIRTUAL_HOST !== undefined){
            database[o.Id] = o;
            //console.log(database);
        }
    });
}
docker.listContainers({all: false},function (err, containers) {
    var index = 0;
    for(container in containers){
        checkContainerAndAdd(containers[container].Id);
    }
});

//Docker Events / Changes
var DockerEvents = require("docker-events");
var emitter = new DockerEvents({
  docker: docker,
});
emitter.on("die", function(message) {
    var record = database[message.id];
    if(record !== undefined){
        delete database[message.id];
    }
});
emitter.on("start", function(message) {
    checkContainerAndAdd(message.id);
});
emitter.start();

//HTTP Proxy Server
var httpProxy = require('http-proxy')
var proxy = httpProxy.createProxy();
require('http').createServer(function(req, res) {
    var hostfound = false;
    for(conf in database){
        var c = database[conf];
        var hosts = c.Env.VIRTUAL_HOST.split(",");
        var host = hosts.indexOf(req.headers.host);
        if(host > -1){
          hostfound = true;    
          var prox = {
            target: "http://"+c.IP+":"+(c.Env.VIRTUAL_PORT || 80),
            ws:true
          };
          proxy.web(req, res, prox);
        }
    }
    if(!hostfound){
        res.writeHead(500, {
            'Content-Type': 'text/plain'
        });
        res.end('Host not found!');
    }
}).listen(80);
proxy.on('error', function (err, req, res) {
  res.writeHead(500, {
    'Content-Type': 'text/plain'
  });
  res.end('Something went wrong! '+err);
});