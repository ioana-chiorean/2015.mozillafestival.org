var express = require('express'),
    Habitat = require('habitat'),
    path = require('path'),
    request = require('request'),
    bodyParser = require('body-parser'),
    compression = require('compression'),
    RateLimit = require('express-rate-limit'),
    GoogleSpreadsheet = require("google-spreadsheet"),
    moment = require('moment-timezone'),
    uuid = require('uuid');

Habitat.load();

var app = express(),
  env = new Habitat();

app.enable('trust proxy');

var limiter = RateLimit({
  windowMs: 60 * 1000,
  delayMs: 1000,
  max: 5,
  global: false
});

app.configure(function() {
  app.use(compression());
  app.use(express.static(__dirname + '/public', {maxAge: 3600000}));
  app.use(bodyParser.json());
  app.use(function(req, res, next) {
    // redirect path with trailing slash, e.g., /path/ to  "/path"
    // since there's no easy way for React Router v0.13 to get both cases working
    // once we upgrade React Router to v1+ we won't need this temp fix anymore
    // see https://github.com/ReactTraining/react-router/issues/820 for more info
    if ( req.path[req.path.length-1] === '/' ) {
      res.redirect(req.path.substr(0,req.path.length-1));
    } else {
      next();
    }
  });
});

app.post(`/add-proposal`, limiter, function(req, res) {
  // make sure keys are all lowercase and contain no symbols or spaces
  // reference: https://www.npmjs.com/package/google-spreadsheet#row-based-api-limitations
  var proposal = Object.assign({}, req.body, {
    uuid: uuid.v4(),
    githubissuenumber: ``,
    timestamp: moment().tz(`Europe/London`).format(`MMM DD, YYYY, h:mm:ssa zz`) // (e.g., May 29, 2017, 8:51:14pm BST)
  });

  var sheet = new GoogleSpreadsheet(env.get(`PROPOSAL_SPREADSHEET_ID_2017`));
  // line breaks are essential for the private key. 
  // if reading this private key from env var this extra replace step is a MUST
  var privateKey = env.get(`GOOGLE_API_PRIVATE_KEY_2017`).replace(/\\n/g, `\n`);

  sheet.useServiceAccountAuth({
    "client_email": env.get(`GOOGLE_API_CLIENT_EMAIL_2017`),
    "private_key": privateKey
  }, (err) => {
    if (err) {
      console.log(`[Error] ${err}`);
      res.status(500).json(err);
    }

    sheet.addRow(1, proposal, (addRowErr) => {
      if (addRowErr) {
        console.log(`[addRowErr]`, addRowErr);
        res.status(500).json(addRowErr);
      }

      res.send(`Success!`);
    });
  });
});

app.post('/add-fringe-event', limiter, function (req, res) {
  var userInputs = {};
  var realFieldNames = {
    name: "entry.904055858",
    time: "entry.686031215",
    location: "entry.1740904233",
    description: "entry.1100204806",
    link: "entry.1926329450",
    privacy: "entry.774776501"
  };
  Object.keys(req.body).forEach(function(maskedFieldName){
    var realFieldName = realFieldNames[maskedFieldName];
    userInputs[realFieldName] = req.body[maskedFieldName];
  });
  request({
    method: 'POST',
    url: env.get('FRINGE_EVENT_FORM_ACTION_URL'),
    form: userInputs
  }, function(err) {
    if (err) {
      console.log("[Error] ", err);
      res.status(500).send({error: err});
    } else {
      res.send("Ok");
    }
  });
});

app.get('*', function (request, response) {
  if (request.path === "/get-fringe-events") {
    // fetches data stored in the Fringe Events Google Spreadsheet
    var sheet = new GoogleSpreadsheet(env.get('FRINGE_EVENT_SPREADSHEET_ID'));
    // line breaks are essential for the private key. 
    // if reading this private key from env var this extra replace step is a MUST
    var privateKey = env.get("GOOGLE_API_PRIVATE_KEY").replace(/\\n/g, '\n')
    sheet.useServiceAccountAuth({
      client_email: env.get("GOOGLE_API_CLIENT_EMAIL"),
      private_key: privateKey
    }, function(err,sheet_info) {
      if (err) {
        console.log("[Error] ", err);
        response.status(500).json(err);
      }
      sheet.getRows(1, function(sheetErr, rows){
        if (sheetErr) {
          console.log("[Error] ", sheetErr);
          response.status(500).json(sheetErr);
        } else {
          response.send( rows.filter(function(row) {
            return row.approved;
          }));
        }
      });
    });
  } else {
    response.sendfile(path.join(__dirname, '/public/index.html'));
  }
});

app.listen(env.get(`PORT`), () => {
  console.log(`\n*******************************************`);
  console.log(`*                                         *`);
  console.log(`*  MozFest listening on port ${env.get(`PORT`)}         *`);
  console.log(`*                                         *`);
  console.log(`*******************************************\n`);
});
