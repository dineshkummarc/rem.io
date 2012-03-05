var root = __dirname + '/../',
    Wait = require(root + '/wait'),
    _ = require('underscore'),
    router = require(root + '/router.js'),
    fs = require('fs'),
    http = require('http'),
    path = require('path'),
    parse = require('url').parse,
    exists = fs.exist || path.exist,
    connect = require('connect'), 
    http = require('http'),
    corsRE = new RegExp('^/(images|uploads)/', 'i'),
    uploads = root + '/uploads',
    monthDict = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    template = _.template(fs.readFileSync(root + '/server/index.html').toString()),
    links = [],
    linksFile = fs.openSync(root + 'links.txt', 'a+');

// pretty sure this isn't the right way...
fs.stat(root + 'links.txt', function (err, stat) {
  if (err) return;
  if (stat.size) fs.read(linksFile, new Buffer(stat.size), 0, stat.size, null, function (err, bytesread, buffer) {
    var body = buffer.toString();
    _.chain(body.split('\n')).filter(function (line) {
      return !!line.trim().length;
    }).each(function (line, i, all) {
      var data = line.trim().split(' '),
          href = data.shift(),
          title = data.length ? data.join(' ') : href,
          hidden = i < (all.length - 10);

      links.push({ href: href, title: title, hidden: hidden, i: i });
    });
  });
});

try { fs.mkdir(uploads); } catch (e) {}

function relative(date) {
  var delta = (+new Date() - date.getTime()) / 1000 | 0,
      mon = monthDict[date.getMonth()],
      day = date.getDate()+'',
      year = date.getFullYear(),
      thisyear = (new Date()).getFullYear(),
      r = '';

  if (delta <= 1) {
    r = delta + 's';
  } else if (delta < (45*60)) {
    r = (~~(delta / 60)) + 'm';
  } else if (delta < (24*60*60)) {
    r = (~~(delta / 3600)) + 'h';
  } else {
    if (thisyear === year) {
      r = day + ' ' + mon;
    } else {
      r = day + ' ' + mon + ' ' + (year+'').substr(2, 2);
    }
  }

  return r;

}

function CORS(req, res, next) {
  // set CORS on all documents that set the crossOrigin prop
  var origin = (req.headers.origin || '').toLowerCase();
  if (corsRE.test(req.url) && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  next();
}

function routes(app) {
  // root redirects to the very last uploaded in the root path
  app.get('/', function (req, res, next) {
    var allfiles = [],
        wait = new Wait();
    fs.readdir(root, wait.until(function (err, files) {
      if (err) return next(new Error(err));
      _.chain(files).filter(function (file) {
        return file.indexOf('.') !== 0 && 
               file !== 'links.txt' && 
               file !== 'uploads';
      }).each(function (file) {
        // ignore dot files
        fs.stat(root + file, wait.until(function (err, stat) {
          allfiles.push({ name: file, mtime: stat.mtime });
        }));
      });
    }));

    wait.oncomplete = function () {
      allfiles = _.sortBy(allfiles, function (file) { return file.mtime });
      var last = allfiles.pop();
      res.writeHead(302, { 'location' : last.name });
      res.end('Location: ' + last.name)
    };
  });

  // show our nice homepage
  app.get('/home', function (req, res, next) {
    // read the root directory
    var wait = new Wait(),
        files = [];

    fs.readdir(root, wait.until(function (err, dirfiles) {
      _.chain(dirfiles).filter(function (file) { 
        return file.indexOf('.') !== 0 && file !== 'links.txt';
      }).each(function (file, i, all) {
        fs.stat(root + file, wait.until(function (err, stat) {
          var href = file,
              title = href,
              timestamp = stat.mtime.toString();

          if (stat.isDirectory()) title += '/';
          files.push({ href: href, title: title, timestamp: timestamp, relative: relative(stat.mtime), mtime: stat.mtime });
        }));
      });
    }));

    wait.oncomplete = function () {
      files = _.sortBy(files, function (file) { return file.mtime.getTime() });

      _.each(files, function (file, i, all) {
        file.hidden = i < (all.length - 10);
      });

      template = _.template(fs.readFileSync(root + '/server/index.html').toString());

      res.end(template({ files: files.reverse(), links: links.slice().reverse() }));
    };
  });

  // return the nth link and redirect
  app.get(/\/link\/(\d+)/, function (req, res) {
    var id = req.params[0];
    if (!links[id]) {
      res.writeHead(404);
    } else {
      res.writeHead(302, {'Location': links[id].href });
    }
    res.end('');
  });

  app.get('/link', function (req, res) {
    res.writeHead(302, {'Location': links[links.length-1].href });
  });

  app.get('/link/save', function (req, res) {
    var href = req.headers.referer,
        title = req.query.title,
        hidden = false;

    save = function (title) {
      var i = links.length;

      links.push({ href: href, title: title, hidden: hidden, i: i });

      // update the hidden status
      _.each(links, function (link, i, all) {
        link.hidden = i < (all.length - 10);
      });

      fs.write(linksFile, href + ' ' + title + '\n', null, 'utf8');
      res.end();
    };

    if (title) {
      save(title);
    } else {
      http.get(parse(href), function(res) {
        var html = '';
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
          html += chunk;
        }).on('end', function () {
          save((html.match(/<title>(.*)<\/title>/i) || [,href])[1]);
        });
      }).on('error', function(e) {
        save(href);
      });
    }

  });

  app.post('/upload', function (req, res) {
    var key = req.body.key || 'upload',
        wait = new Wait(),
        upload = function (file) {
          fs.rename(file.path, uploads + '/' + file.name, wait.until());
        };

    if (Array.isArray(req.files[key])) {
      req.files[key].forEach(upload);
    } else {
      upload(req.files[key]);
    }

    wait.oncomplete = function () {
      if (req.headers['x-requested-with'] == 'XMLHttpRequest') {
      } else {
        res.writeHead(302, {'Location': req.headers.referer });
      }
      res.end();
    }
  });
}

var app = connect.createServer()
  .use(CORS)
  .use(connect.bodyParser({ uploadDir: uploads }))
  .use(connect.query())
  .use(connect.favicon())
  .use(connect.logger('tiny'))
  .use(router(routes))
  .use(connect.static(__dirname + '/../'))
  .use(connect.directory(__dirname + '/../'))

app.listen(process.argv[2] || 8000);

// console.log('web server running on http://' + app.address().address + ':' + app.address().port);
