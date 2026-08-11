/* =========================================================================
   SPL Playground - Mock data generator
   Deterministic (seeded) so that every user sees identical results and
   challenge answers stay stable.
   ========================================================================= */
(function (global) {
  'use strict';

  /* ---------- seeded PRNG (mulberry32) ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var rnd = mulberry32(20260811);
  function rand() { return rnd(); }
  function ri(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }
  function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
  function weighted(pairs) {
    var total = 0, i;
    for (i = 0; i < pairs.length; i++) total += pairs[i][1];
    var r = rand() * total;
    for (i = 0; i < pairs.length; i++) { r -= pairs[i][1]; if (r <= 0) return pairs[i][0]; }
    return pairs[pairs.length - 1][0];
  }

  /* ---------- reference tables ---------- */

  var PRODUCTS = [
    { productId: 'DB-SG-G01', product_name: 'Mediocre Kingdoms',   price: 24.99, categoryId: 'STRATEGY' },
    { productId: 'DC-SG-G02', product_name: 'Dream Crusher',       price: 39.99, categoryId: 'STRATEGY' },
    { productId: 'FS-SG-G03', product_name: 'Final Sequel',        price: 24.99, categoryId: 'STRATEGY' },
    { productId: 'WC-SH-G04', product_name: 'World of Cheese',     price: 24.99, categoryId: 'SHOOTER'  },
    { productId: 'WC-SH-A01', product_name: 'Orvil the Wolverine', price: 19.99, categoryId: 'SHOOTER'  },
    { productId: 'WC-SH-T02', product_name: 'Holy Blade of Gouda', price: 5.99,  categoryId: 'SHOOTER'  },
    { productId: 'PZ-SG-G05', product_name: 'Puppies vs. Zombies', price: 4.99,  categoryId: 'STRATEGY' },
    { productId: 'CU-PG-G06', product_name: 'Curling 2014',        price: 19.99, categoryId: 'SPORTS'   },
    { productId: 'MB-AG-G07', product_name: 'Manganiello Bros.',   price: 39.99, categoryId: 'ARCADE'   },
    { productId: 'MB-AG-T01', product_name: 'Benign Space Debris', price: 24.99, categoryId: 'ARCADE'   },
    { productId: 'BS-AG-G09', product_name: 'Fire Resistance Suit',price: 9.99,  categoryId: 'ARCADE'   },
    { productId: 'SC-MG-G10', product_name: 'SIM Cubicle',         price: 19.99, categoryId: 'SIMULATION' },
    { productId: 'SF-BVS-G01',product_name: 'Grand Theft Scooter', price: 29.99, categoryId: 'SIMULATION' },
    { productId: 'SF-BVS-01', product_name: 'Cheese Whiz Wizard',  price: 14.99, categoryId: 'SIMULATION' }
  ];

  var HTTP_STATUS = [
    { status: '200', status_description: 'OK',                    status_type: 'Success' },
    { status: '201', status_description: 'Created',               status_type: 'Success' },
    { status: '301', status_description: 'Moved Permanently',     status_type: 'Redirect' },
    { status: '302', status_description: 'Found',                 status_type: 'Redirect' },
    { status: '304', status_description: 'Not Modified',          status_type: 'Redirect' },
    { status: '400', status_description: 'Bad Request',           status_type: 'Client Error' },
    { status: '401', status_description: 'Unauthorized',          status_type: 'Client Error' },
    { status: '403', status_description: 'Forbidden',             status_type: 'Client Error' },
    { status: '404', status_description: 'Not Found',             status_type: 'Client Error' },
    { status: '408', status_description: 'Request Timeout',       status_type: 'Client Error' },
    { status: '500', status_description: 'Internal Server Error', status_type: 'Server Error' },
    { status: '503', status_description: 'Service Unavailable',   status_type: 'Server Error' }
  ];

  var USERS = [
    { user: 'amber',   full_name: 'Amber Tan',       department: 'Sales',      role: 'user',    email: 'amber@buttercupgames.com' },
    { user: 'bwilson', full_name: 'Beth Wilson',     department: 'Finance',    role: 'user',    email: 'bwilson@buttercupgames.com' },
    { user: 'carlos',  full_name: 'Carlos Mendes',   department: 'IT',         role: 'admin',   email: 'carlos@buttercupgames.com' },
    { user: 'djohnson',full_name: 'Dana Johnson',    department: 'Marketing',  role: 'user',    email: 'djohnson@buttercupgames.com' },
    { user: 'ehunt',   full_name: 'Ethan Hunt',      department: 'IT',         role: 'admin',   email: 'ehunt@buttercupgames.com' },
    { user: 'fiona',   full_name: 'Fiona Chan',      department: 'Support',    role: 'user',    email: 'fiona@buttercupgames.com' },
    { user: 'gsingh',  full_name: 'Gita Singh',      department: 'Engineering',role: 'poweruser',email:'gsingh@buttercupgames.com' },
    { user: 'hmartin', full_name: 'Hugo Martin',     department: 'Engineering',role: 'poweruser',email:'hmartin@buttercupgames.com' },
    { user: 'root',    full_name: 'System Root',     department: 'IT',         role: 'admin',   email: 'root@buttercupgames.com' },
    { user: 'jdoe',    full_name: 'Jane Doe',        department: 'Sales',      role: 'user',    email: 'jdoe@buttercupgames.com' }
  ];

  var VENDORS = [
    { VendorID: '1001', VendorCountry: 'United States', VendorCity: 'San Francisco', VendorStateProvince: 'CA', VendorLatitude: '37.7749',  VendorLongitude: '-122.4194' },
    { VendorID: '1002', VendorCountry: 'United States', VendorCity: 'Austin',        VendorStateProvince: 'TX', VendorLatitude: '30.2672',  VendorLongitude: '-97.7431'  },
    { VendorID: '1003', VendorCountry: 'Singapore',     VendorCity: 'Singapore',     VendorStateProvince: 'SG', VendorLatitude: '1.3521',   VendorLongitude: '103.8198'  },
    { VendorID: '1004', VendorCountry: 'Germany',       VendorCity: 'Berlin',        VendorStateProvince: 'BE', VendorLatitude: '52.5200',  VendorLongitude: '13.4050'   },
    { VendorID: '1005', VendorCountry: 'Japan',         VendorCity: 'Tokyo',         VendorStateProvince: '13', VendorLatitude: '35.6762',  VendorLongitude: '139.6503'  },
    { VendorID: '1006', VendorCountry: 'Brazil',        VendorCity: 'Sao Paulo',     VendorStateProvince: 'SP', VendorLatitude: '-23.5505', VendorLongitude: '-46.6333'  },
    { VendorID: '1007', VendorCountry: 'United Kingdom',VendorCity: 'London',        VendorStateProvince: 'ENG',VendorLatitude: '51.5074',  VendorLongitude: '-0.1278'   },
    { VendorID: '1008', VendorCountry: 'Australia',     VendorCity: 'Sydney',        VendorStateProvince: 'NSW',VendorLatitude: '-33.8688', VendorLongitude: '151.2093'  }
  ];

  /* IP -> geo, used by the mock iplocation command and by clientip generation */
  var GEO_BLOCKS = [
    { prefix: '182.236.',  City: 'Singapore',     Country: 'Singapore',      Region: 'Singapore', lat: 1.3521,  lon: 103.8198 },
    { prefix: '87.194.',   City: 'London',        Country: 'United Kingdom', Region: 'England',   lat: 51.5074, lon: -0.1278 },
    { prefix: '198.35.',   City: 'San Francisco', Country: 'United States',  Region: 'CA',        lat: 37.7749, lon: -122.4194 },
    { prefix: '107.3.',    City: 'Austin',        Country: 'United States',  Region: 'TX',        lat: 30.2672, lon: -97.7431 },
    { prefix: '91.205.',   City: 'Berlin',        Country: 'Germany',        Region: 'Berlin',    lat: 52.52,   lon: 13.405 },
    { prefix: '211.166.',  City: 'Tokyo',         Country: 'Japan',          Region: 'Tokyo',     lat: 35.6762, lon: 139.6503 },
    { prefix: '186.226.',  City: 'Sao Paulo',     Country: 'Brazil',         Region: 'Sao Paulo', lat: -23.5505,lon: -46.6333 },
    { prefix: '203.0.113.',City: 'Sydney',        Country: 'Australia',      Region: 'NSW',       lat: -33.8688,lon: 151.2093 }
  ];

  var UA = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
    'Googlebot/2.1 (+http://www.google.com/bot.html)',
    'curl/8.4.0'
  ];

  var WEB_HOSTS = ['www1', 'www2', 'www3'];
  var MAIL_HOSTS = ['mailsv1', 'mailsv2'];
  var DB_HOSTS = ['db01', 'db02'];
  var WIN_HOSTS = ['ACME-WIN-DC01', 'ACME-WIN-FS02', 'ACME-WIN-WKS17'];

  /* ---------- helpers ---------- */

  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function pad(n, w) { var s = String(n); while (s.length < (w || 2)) s = '0' + s; return s; }

  function clfTime(d) {
    // 11/Aug/2026:10:23:14 +0000
    return pad(d.getDate()) + '/' + MONTHS[d.getMonth()] + '/' + d.getFullYear() + ':' +
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + ' +0000';
  }
  function syslogTime(d) {
    return MONTHS[d.getMonth()] + ' ' + pad(d.getDate(), 2) + ' ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function isoTime(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' +
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '.' + pad(d.getMilliseconds(), 3);
  }
  function usTime(d) {
    return pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + '/' + d.getFullYear() + ' ' +
      pad(((d.getHours() + 11) % 12) + 1) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + ' ' +
      (d.getHours() < 12 ? 'AM' : 'PM');
  }

  /* Prefixes carry a variable number of octets, so top up to a full four. */
  function randIP(block) {
    var have = (block.prefix.match(/\./g) || []).length;
    var parts = [];
    for (var i = have; i < 4; i++) parts.push(ri(1, 254));
    return block.prefix + parts.join('.');
  }

  /* Diurnal weighting: more traffic during business hours. */
  function timeWeight(hour) {
    var curve = [0.2,0.15,0.1,0.1,0.15,0.3,0.6,1.0,1.6,2.0,2.2,2.1,1.9,2.0,2.2,2.1,1.8,1.4,1.1,0.9,0.8,0.6,0.4,0.3];
    return curve[hour];
  }

  /* Produce N timestamps spread over [start,end] with a diurnal shape. */
  function makeTimes(n, start, end) {
    var out = [], i;
    for (i = 0; i < n; i++) {
      var t, guard = 0;
      do {
        t = start + rand() * (end - start);
        guard++;
      } while (guard < 6 && rand() > timeWeight(new Date(t * 1000).getHours()) / 2.2);
      out.push(t);
    }
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  /* =====================================================================
     Event builders
     ===================================================================== */

  /* A fixed pool of client IPs, so "top talkers" style searches are meaningful. */
  function buildIPPool(size, weights) {
    var pool = [];
    for (var i = 0; i < size; i++) {
      var geo = weighted(weights);
      pool.push({ ip: randIP(geo), geo: geo, w: 1 + Math.floor(rand() * 6) });
    }
    return pool;
  }

  var WEB_GEO_WEIGHTS = [[GEO_BLOCKS[2], 30], [GEO_BLOCKS[3], 20], [GEO_BLOCKS[0], 15],
                         [GEO_BLOCKS[1], 12], [GEO_BLOCKS[4], 8], [GEO_BLOCKS[5], 6],
                         [GEO_BLOCKS[6], 5], [GEO_BLOCKS[7], 4]];

  /* Web traffic is generated as browsing SESSIONS: one client, one JSESSIONID,
     several page views a few minutes apart. That makes transaction, dedup and
     "count by clientip" behave the way they do against real access logs.      */
  function buildWeb(targetEvents, start, end) {
    var pool = buildIPPool(90, WEB_GEO_WEIGHTS);
    var poolW = pool.map(function (p) { return [p, p.w]; });
    var events = [];
    var seq = 0;

    while (events.length < targetEvents) {
      var client = weighted(poolW);
      var jsess = 'SD' + ri(0, 9) + 'SL' + ri(1, 9) + 'FF' + ri(1, 9) + 'ADFF' + ri(1, 9) + ri(0, 9);
      var ua = weighted([[UA[0], 35], [UA[1], 18], [UA[2], 14], [UA[3], 12], [UA[4], 10], [UA[5], 7], [UA[6], 4]]);
      var user = rand() < 0.35 ? pick(USERS).user : '-';
      var host = pick(WEB_HOSTS);
      var sessStart, guard = 0;
      do { sessStart = start + rand() * (end - start); guard++; }
      while (guard < 6 && rand() > timeWeight(new Date(sessStart * 1000).getHours()) / 2.2);

      var pages = weighted([[1, 20], [2, 20], [3, 16], [4, 12], [5, 10], [6, 8], [8, 7], [11, 5], [15, 2]]);
      var t = sessStart;
      var cat = pick(PRODUCTS).categoryId;

      for (var p = 0; p < pages && events.length < targetEvents; p++) {
        t += ri(4, 240);
        if (t > end) break;
        var d = new Date(t * 1000);
        var prod = weighted(PRODUCTS.map(function (x, idx) { return [x, 14 - idx * 0.7]; }));
        var page = p === 0 ? weighted([['/home', 50], ['/category.screen', 35], ['/product.screen', 15]])
                           : weighted([['/product.screen', 38], ['/category.screen', 20], ['/cart.do', 18],
                                       ['/home', 8], ['/oldlink', 5], ['/checkout.do', 6], ['/success.do', 5]]);
        var action = weighted([['view', 50], ['addtocart', 22], ['purchase', 15], ['remove', 6], ['changequantity', 7]]);
        var status = weighted([['200', 78], ['404', 6], ['503', 4], ['500', 3], ['301', 3],
                               ['302', 3], ['403', 2], ['400', 1]]);
        var method = page === '/cart.do' || page === '/checkout.do' ? weighted([['POST', 70], ['GET', 30]])
                                                                   : weighted([['GET', 92], ['POST', 6], ['HEAD', 2]]);
        var bytes = ri(400, 8200);
        var query = '';
        if (page === '/product.screen') query = 'productId=' + prod.productId;
        else if (page === '/category.screen') query = 'categoryId=' + cat;
        else if (page === '/cart.do') query = 'action=' + action + '&itemId=EST-' + ri(1, 20) + '&productId=' + prod.productId;
        else if (page === '/success.do') query = 'action=purchase&productId=' + prod.productId;
        var uri = page + (query ? '?' + query + '&JSESSIONID=' + jsess : '?JSESSIONID=' + jsess);
        var referer = 'http://www.buttercupgames.com' +
          pick(['/category.screen?categoryId=' + cat, '/home', '/product.screen?productId=' + prod.productId, '-']);
        var respTime = ri(20, 2400);
        var raw = client.ip + ' - ' + user + ' [' + clfTime(d) + '] "' + method + ' ' + uri + ' HTTP/1.1" ' +
          status + ' ' + bytes + ' "' + referer + '" "' + ua + '" ' + respTime;

        events.push({
          _time: t, _raw: raw,
          index: 'web', sourcetype: 'access_combined_wcookie',
          source: '/opt/logs/access.log', host: host,
          clientip: client.ip, method: method, uri_path: page, uri_query: query, uri: uri,
          status: status, bytes: bytes, referer: referer, referer_domain: 'www.buttercupgames.com',
          useragent: ua, JSESSIONID: jsess, response_time_ms: respTime,
          productId: (page === '/product.screen' || page === '/cart.do' || page === '/success.do') ? prod.productId : null,
          categoryId: (page === '/category.screen') ? cat : null,
          action: (page === '/cart.do') ? action : (page === '/success.do' ? 'purchase' : null),
          user: user === '-' ? null : user
        });
        seq++;
      }
    }
    events.sort(function (a, b) { return a._time - b._time; });
    return events;
  }

  var ATTACKERS = ['203.0.113.42', '203.0.113.77', '186.226.13.9', '91.205.44.201'];
  var SSH_SOURCES = null;

  function buildLinuxSecure(times) {
    var events = [];
    var attackers = ATTACKERS;
    if (!SSH_SOURCES) {
      SSH_SOURCES = [];
      for (var s = 0; s < 26; s++) SSH_SOURCES.push(randIP(pick(GEO_BLOCKS)));
    }
    for (var i = 0; i < times.length; i++) {
      var t = times[i], d = new Date(t * 1000);
      var host = pick(MAIL_HOSTS.concat(DB_HOSTS).concat(WEB_HOSTS));
      var kind = weighted([['fail', 34], ['success', 40], ['invalid', 12], ['sudo', 10], ['session', 4]]);
      var raw, ev = {
        _time: t, index: 'security', sourcetype: 'linux_secure',
        source: '/var/log/secure', host: host
      };
      if (kind === 'fail') {
        var u = pick(USERS).user, ip = weighted([[pick(attackers), 55], [pick(SSH_SOURCES), 45]]);
        raw = syslogTime(d) + ' ' + host + ' sshd[' + ri(1000, 9999) + ']: Failed password for ' + u +
          ' from ' + ip + ' port ' + ri(1024, 65535) + ' ssh2';
        ev.user = u; ev.src_ip = ip; ev.action = 'failure'; ev.app = 'sshd'; ev.vendor_action = 'Failed password';
      } else if (kind === 'invalid') {
        var iu = pick(['admin', 'test', 'oracle', 'postgres', 'guest', 'ubuntu']);
        var ip2 = pick(attackers);
        raw = syslogTime(d) + ' ' + host + ' sshd[' + ri(1000, 9999) + ']: Failed password for invalid user ' + iu +
          ' from ' + ip2 + ' port ' + ri(1024, 65535) + ' ssh2';
        ev.user = iu; ev.src_ip = ip2; ev.action = 'failure'; ev.app = 'sshd'; ev.vendor_action = 'Failed password for invalid user';
      } else if (kind === 'success') {
        var u3 = pick(USERS).user, ip3 = pick(SSH_SOURCES);
        raw = syslogTime(d) + ' ' + host + ' sshd[' + ri(1000, 9999) + ']: Accepted password for ' + u3 +
          ' from ' + ip3 + ' port ' + ri(1024, 65535) + ' ssh2';
        ev.user = u3; ev.src_ip = ip3; ev.action = 'success'; ev.app = 'sshd'; ev.vendor_action = 'Accepted password';
      } else if (kind === 'sudo') {
        var u4 = pick(USERS).user;
        raw = syslogTime(d) + ' ' + host + ' sudo: ' + u4 + ' : TTY=pts/' + ri(0, 4) +
          ' ; PWD=/home/' + u4 + ' ; USER=root ; COMMAND=/bin/' + pick(['systemctl restart splunk', 'cat /etc/shadow', 'yum update', 'ls -la /root']);
        ev.user = u4; ev.action = 'success'; ev.app = 'sudo'; ev.vendor_action = 'sudo';
      } else {
        var u5 = pick(USERS).user;
        raw = syslogTime(d) + ' ' + host + ' sshd[' + ri(1000, 9999) + ']: pam_unix(sshd:session): session opened for user ' + u5 + ' by (uid=0)';
        ev.user = u5; ev.action = 'success'; ev.app = 'sshd'; ev.vendor_action = 'session opened';
      }
      ev._raw = raw;
      events.push(ev);
    }
    return events;
  }

  function buildWindows(times) {
    var events = [];
    var codes = [
      ['4624', 'An account was successfully logged on', 'success'],
      ['4625', 'An account failed to log on', 'failure'],
      ['4634', 'An account was logged off', 'success'],
      ['4672', 'Special privileges assigned to new logon', 'success'],
      ['4720', 'A user account was created', 'success'],
      ['4732', 'A member was added to a security-enabled local group', 'success'],
      ['4768', 'A Kerberos authentication ticket (TGT) was requested', 'success']
    ];
    for (var i = 0; i < times.length; i++) {
      var t = times[i], d = new Date(t * 1000);
      var c = weighted([[codes[0], 34], [codes[1], 22], [codes[2], 18], [codes[3], 10],
                        [codes[4], 5], [codes[5], 4], [codes[6], 7]]);
      var host = pick(WIN_HOSTS);
      var u = pick(USERS).user;
      var lt = pick(['2', '3', '10', '5']);
      var src = randIP(pick(GEO_BLOCKS));
      var raw = usTime(d) + '\nLogName=Security\nEventCode=' + c[0] + '\nEventType=' + (c[2] === 'failure' ? 0 : 4) +
        '\nComputerName=' + host + '.acme.local\nSourceName=Microsoft Windows security auditing.' +
        '\nType=Information\nTaskCategory=Logon\nOpCode=Info\nRecordNumber=' + ri(100000, 999999) +
        '\nKeywords=Audit ' + (c[2] === 'failure' ? 'Failure' : 'Success') +
        '\nMessage=' + c[1] + '\n\nSubject:\n\tSecurity ID:\t\tACME\\' + u +
        '\n\tAccount Name:\t\t' + u + '\n\tAccount Domain:\t\tACME\n\tLogon ID:\t\t0x' + ri(100000, 999999).toString(16).toUpperCase() +
        '\n\nLogon Type:\t\t\t' + lt + '\n\nNetwork Information:\n\tWorkstation Name:\t' + host +
        '\n\tSource Network Address:\t' + src + '\n\tSource Port:\t\t' + ri(1024, 65535);
      events.push({
        _time: t, _raw: raw, index: 'windows', sourcetype: 'WinEventLog:Security',
        source: 'WinEventLog:Security', host: host,
        EventCode: c[0], Account_Name: u, user: u, Logon_Type: lt,
        Source_Network_Address: src, src_ip: src,
        action: c[2], signature: c[1], status: c[2] === 'failure' ? 'failure' : 'success'
      });
    }
    return events;
  }

  var FW_EXTERNAL = null;
  function buildFirewall(times) {
    var events = [];
    var internal = ['10.2.1.', '10.2.2.', '10.3.7.'];
    if (!FW_EXTERNAL) {
      FW_EXTERNAL = [];
      for (var f = 0; f < 34; f++) FW_EXTERNAL.push(randIP(pick(GEO_BLOCKS)));
    }
    for (var i = 0; i < times.length; i++) {
      var t = times[i], d = new Date(t * 1000);
      var action = weighted([['allowed', 72], ['blocked', 24], ['dropped', 4]]);
      var proto = weighted([['tcp', 70], ['udp', 25], ['icmp', 5]]);
      var dport = weighted([['443', 40], ['80', 20], ['22', 8], ['3389', 6], ['53', 10],
                            ['445', 5], ['8089', 4], ['1433', 3], ['25', 4]]);
      var src = pick(internal) + ri(2, 60);
      var dst = pick(FW_EXTERNAL);
      if (rand() < 0.4) { var tmp = src; src = dst; dst = tmp; }
      var bin = ri(60, 90000), bout = ri(60, 40000);
      var host = 'fw0' + ri(1, 2);
      var rule = pick(['allow-web-outbound', 'block-highrisk', 'allow-vpn', 'deny-any-any', 'allow-internal']);
      var raw = syslogTime(d) + ' ' + host + ' TRAFFIC action="' + action + '" src_ip=' + src +
        ' src_port=' + ri(1024, 65535) + ' dest_ip=' + dst + ' dest_port=' + dport +
        ' protocol=' + proto + ' bytes_in=' + bin + ' bytes_out=' + bout +
        ' rule="' + rule + '" session_id=' + ri(100000, 999999);
      events.push({
        _time: t, _raw: raw, index: 'network', sourcetype: 'pan:traffic',
        source: 'udp:514', host: host,
        action: action, src_ip: src, dest_ip: dst, dest_port: dport, protocol: proto,
        bytes_in: bin, bytes_out: bout, bytes: bin + bout, rule: rule
      });
    }
    return events;
  }

  function buildVendorSales(times) {
    var events = [];
    for (var i = 0; i < times.length; i++) {
      var t = times[i], d = new Date(t * 1000);
      var v = pick(VENDORS);
      var p = pick(PRODUCTS);
      var qty = ri(1, 5);
      var sale = +(p.price * qty * (rand() < 0.2 ? 0.8 : 1)).toFixed(2);
      var raw = 'VendorID=' + v.VendorID + ' Code=' + pick(['A', 'B', 'C', 'D']) +
        ' AcctID=' + ri(1000000000, 9999999999) + ' product_name="' + p.product_name + '"' +
        ' productId=' + p.productId + ' categoryId=' + p.categoryId +
        ' price=' + p.price + ' quantity=' + qty + ' sale_price=' + sale;
      events.push({
        _time: t, _raw: raw, index: 'sales', sourcetype: 'vendor_sales',
        source: '/opt/logs/vendor_sales.log', host: 'sales-app-01',
        VendorID: v.VendorID, product_name: p.product_name, productId: p.productId,
        categoryId: p.categoryId, price: p.price, quantity: qty, sale_price: sale
      });
    }
    return events;
  }

  function buildAppJson(times) {
    var events = [];
    var levels = [['INFO', 60], ['WARN', 20], ['ERROR', 15], ['DEBUG', 5]];
    var svcs = ['checkout', 'inventory', 'auth', 'payments', 'search'];
    for (var i = 0; i < times.length; i++) {
      var t = times[i], d = new Date(t * 1000);
      var lvl = weighted(levels);
      var svc = pick(svcs);
      var u = pick(USERS);
      var dur = ri(3, 5200);
      var obj = {
        timestamp: isoTime(d) + 'Z',
        level: lvl,
        service: svc,
        trace_id: 'trc-' + ri(100000, 999999),
        duration_ms: dur,
        http: { method: pick(['GET', 'POST', 'PUT']), path: '/api/v1/' + svc, status: lvl === 'ERROR' ? pick([500, 502, 503]) : 200 },
        user: { name: u.user, department: u.department, roles: [u.role, 'employee'] },
        message: lvl === 'ERROR' ? pick(['upstream timeout', 'null pointer in cart handler', 'db connection refused'])
               : lvl === 'WARN' ? pick(['slow query detected', 'retrying request', 'cache miss rate high'])
               : pick(['request completed', 'cache warmed', 'job finished'])
      };
      events.push({
        _time: t, _raw: JSON.stringify(obj), index: 'app', sourcetype: 'app:json',
        source: '/var/log/app/service.json', host: 'app0' + ri(1, 3),
        level: lvl, service: svc, duration_ms: dur, trace_id: obj.trace_id, user: u.user
      });
    }
    return events;
  }

  /* =====================================================================
     Assemble
     ===================================================================== */

  function generate() {
    var now = Math.floor(Date.now() / 1000);
    var start = now - 7 * 86400;

    var events = []
      .concat(buildWeb(2600, start, now))
      .concat(buildLinuxSecure(makeTimes(800, start, now)))
      .concat(buildWindows(makeTimes(700, start, now)))
      .concat(buildFirewall(makeTimes(950, start, now)))
      .concat(buildVendorSales(makeTimes(420, start, now)))
      .concat(buildAppJson(makeTimes(500, start, now)));

    events.sort(function (a, b) { return b._time - a._time; });

    // strip nulls so field discovery is accurate
    events.forEach(function (e, idx) {
      e._time = Math.floor(e._time);
      Object.keys(e).forEach(function (k) { if (e[k] === null || e[k] === undefined) delete e[k]; });
      e._cd = '1:' + (idx + 1);
      e.linecount = String(e._raw).split('\n').length;
      e.punct = String(e._raw).slice(0, 30).replace(/[a-zA-Z0-9 ]/g, '');
      e.splunk_server = 'idx-' + ((idx % 2) + 1);
      e.eventtype = eventTypeFor(e);
      e.tag = tagsFor(e);
    });

    return {
      events: events,
      lookups: {
        product_lookup: PRODUCTS.slice(),
        http_status: HTTP_STATUS.slice(),
        user_roles: USERS.slice(),
        geo_vendor: VENDORS.slice(),
        prices: PRODUCTS.map(function (p) { return { productId: p.productId, product_name: p.product_name, price: p.price }; })
      },
      geoBlocks: GEO_BLOCKS,
      timeRange: { earliest: start, latest: now }
    };
  }

  /* Pre-assigned event types & tags, so the knowledge-object commands work. */
  function eventTypeFor(e) {
    var et = [];
    if (e.sourcetype === 'linux_secure' && e.action === 'failure') et.push('failed_login');
    if (e.sourcetype === 'linux_secure' && e.action === 'success') et.push('successful_login');
    if (e.sourcetype === 'WinEventLog:Security' && e.EventCode === '4625') et.push('failed_login', 'windows_logon');
    if (e.sourcetype === 'WinEventLog:Security' && e.EventCode === '4624') et.push('successful_login', 'windows_logon');
    if (e.sourcetype === 'access_combined_wcookie') {
      et.push('web_traffic');
      if (String(e.status).charAt(0) === '4' || String(e.status).charAt(0) === '5') et.push('web_error');
      if (e.action === 'purchase') et.push('web_purchase');
    }
    if (e.sourcetype === 'pan:traffic' && e.action !== 'allowed') et.push('firewall_deny');
    if (e.sourcetype === 'app:json' && e.level === 'ERROR') et.push('app_error');
    return et.length === 1 ? et[0] : (et.length ? et : undefined);
  }
  function tagsFor(e) {
    var t = [];
    if (e.index === 'security' || e.index === 'windows') t.push('authentication');
    if (e.action === 'failure') t.push('failure');
    if (e.action === 'success') t.push('success');
    if (e.index === 'network') t.push('network', 'communicate');
    if (e.index === 'web') t.push('web');
    if (e.index === 'sales') t.push('sales');
    return t.length === 1 ? t[0] : (t.length ? t : undefined);
  }

  global.SPLData = { generate: generate, PRODUCTS: PRODUCTS, HTTP_STATUS: HTTP_STATUS, USERS: USERS, VENDORS: VENDORS };

})(typeof window !== 'undefined' ? window : this);
