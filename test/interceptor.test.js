/*!
 * test/interceptor.test.js 
 * Copyright(c) 2012 dead_horse <dead_horse@qq.com>
 * MIT Licensed
 */

"use strict";

/**
 * Module dependencies.
 */
var pedding = require('pedding');
var interceptor = require('../');
var http = require('http');
var should = require('should');
var net = require('net');

describe('#interceptor', function() {
  it('should throw error by wrong target', function () {
    try {
      interceptor.create('127.0.0.1');
    } catch (err) {
      err.message.should.equal('target type error, must like 127.0.0.1:6379');
    }
  });
  describe('#net', function() {
    var _server;
    var proxy;
    var client;
    var client2;
    before(function(done) {
      _server = net.createServer(function(s) {
        s.pipe(s);
        s.on('error', function(err) {
        });
      });
      _server.listen(16789);
      proxy = interceptor.create('127.0.0.1:16789', 100);
      proxy.listen(16788);
      done = pedding(2, done);
      proxy.once('_connect', function () {
        proxy.inStream._connections.should.equal(1);
        done();
      });
      client = net.connect(16788, '127.0.0.1', function () {
        done();
      });
    });

    after(function() {
      proxy.close();
      _server.close();
    });

    it('should return address info', function () {
      proxy.address().should.eql({ address: '0.0.0.0', family: 'IPv4', port: 16788 });
    });

    it('should ok at first', function(done) {
      client.once('data', function(data) {
        String(data).should.equal('ping');
        done();
      });
      client.write('ping');
    });

    it('should ok connect twice', function(done) {
      var count = 2;
      client2 = net.connect(16788, '127.0.0.1');
      client2.once('data', function(data) {
        String(data).should.equal('ping');
        if (--count === 0){
          setTimeout(function () {
            done();
          }, 100);
        }
      });
      client2.write('ping');

      client.once('data', function(data) {
        String(data).should.equal('pong');
        if (--count === 0){
          setTimeout(function () {
            done();
          }, 100);
        }
      });
      client.write('pong');
    });

    it('should timeout', function (done) {
      client2.once('data', function () {
        throw new Error('should not get data when timeout');
      });
      setTimeout(function () {
        client2.end();
        done();
      }, 50);
      client2.write('pong');
    });

    it('should intercept by proxy', function(done) {
      setTimeout(function() {
        client.removeAllListeners('close');
        client.removeAllListeners('data');
        proxy.inStream._connections.should.equal(1);
        _server._connections.should.equal(1);
        done();
      }, 500);
      client.once('data', function(data) {
        throw new Error('should not response exist socket');
      });
      client.once('close', function () {
        throw new Error('should not emit exist socket\'s close event');
      });
      proxy.block();
      client.write('ping');
    });

    it('should end client ok', function (done) {
      proxy.inStream.once('close', done);
      client.end();
    });

    it('should reopen ok', function(done) {
      proxy.open();
      client = net.connect(16788, '127.0.0.1');
      client.once('data', function(data) {
        String(data).should.equal('ping');
        done();
      });
      client.write('ping');
    });

    it('should emit error ok', function (done) {
      client.on('close', function () {
        done();
      });
      proxy.outArr[1].emit('error', new Error('mock error'));
      proxy.outArr.length.should.equal(1);
    });

    it('should end ok', function(done) {
      client.end();
      setTimeout(function(){
        _server._connections.should.equal(1);
        done();
      },100);
    });
  });

  describe('#http', function() {
    var _server;
    var proxy;
    var client;
    before(function() {
      _server = http.createServer(function(req, res) {
        res.end(req.method + req.url);
      });
      _server.listen(16789);
      proxy = interceptor.create('127.0.0.1:16789');
      proxy.listen(16788);
    });

    after(function() {
      proxy.close();
      _server.close();
    });
    var _res;
    it('should ok at first', function(done) {
      http.get('http://127.0.0.1:16788/test', function(res) {
        res.statusCode.should.equal(200);
        res.on('data', function(data) {
          String(data).should.equal('GET/test');
          done();
        });
      });
    });

    it('should intercept by proxy', function(done) {
       proxy.block();
       http.get('http://127.0.0.1:16788/test', function(res) {
       }).on('error', function (err) {
         err.code.should.equal('ECONNREFUSED');
         done();
       });
    });

    it('should reopen ok', function(done) {
      proxy.open();
      http.get('http://127.0.0.1:16788/test', function(res) {
        res.statusCode.should.equal(200);
        res.on('data', function(data) {
          String(data).should.equal('GET/test');
          done();
        });
      });
    });
  });
});
