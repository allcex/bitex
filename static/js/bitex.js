// ==ClosureCompiler==
// @compilation_level ADVANCED_OPTIMIZATIONS
// @use_closure_library true
// @externs_url https://closure-compiler.googlecode.com/git/contrib/externs/jquery-1.9.js
// ==/ClosureCompiler==

goog.provide('BitEx');
goog.provide('BitEx.EventType');
goog.provide('BitEx.BitExEvent');

goog.require('goog.events');
goog.require('goog.events.Event');
goog.require('goog.events.EventTarget');

var WEB_SOCKET_NOT_AVAILABLE_EXCEPTION = "WebSockets are not available";

/**
 * @constructor
 * @extends {goog.events.EventTarget}
 */
var BitEx = function(){
  goog.base(this);

};
goog.inherits(BitEx, goog.events.EventTarget);


/**
 * @type {WebSocket}
 * @private
 */
BitEx.prototype.ws_ = null;



/**
 * The events fired by the web socket.
 * @enum {string} The event types for the web socket.
 */
BitEx.EventType = {
  CLOSED: 'closed',
  ERROR: 'error',
  OPENED: 'opened',

  RAW_MESSAGE: 'raw_message',
  LOGIN_OK: 'login_ok',
  LOGIN_ERROR: 'login_error',

  /* Trading */
  BALANCE_RESPONSE: 'balance_response',
  ORDER_LIST_RESPONSE: 'order_list_response',
  HEARTBEAT: 'heartbeat',
  EXECUTION_REPORT: 'execution_report',

  /* Market Data */
  MARKET_DATA_FULL_REFRESH : 'md_full_refresh',
  MARKET_DATA_INCREMENTAL_REFRESH: 'md_incremental_refresh',
  MARKET_DATA_REQUEST_REJECT: 'md_request_reject',
  TRADE: 'trade',
  TRADE_CLEAR: 'trade_clear',
  ORDER_BOOK_CLEAR: 'ob_clear',
  ORDER_BOOK_DELETE_ORDERS_THRU: 'ob_delete_orders_thru',
  ORDER_BOOK_DELETE_ORDER: 'ob_delete_order',
  ORDER_BOOK_NEW_ORDER: 'ob_new_order',
  ORDER_BOOK_UPDATE_ORDER: 'ob_update_order'
};

/**
 * Open a connection with BitEx server
 * @param {string} url
 */
BitEx.prototype.open = function(url) {

  if ("WebSocket" in window) {
    this.ws_ = new WebSocket(url);
  } else if ("MozWebSocket" in window) {
    this.ws_ = new MozWebSocket(url);
  } else {
    throw WEB_SOCKET_NOT_AVAILABLE_EXCEPTION;
  }

  this.ws_.onopen = goog.bind(this.onOpen_, this);
  this.ws_.onclose = goog.bind(this.onClose_, this);
  this.ws_.onmessage = goog.bind(this.onMessage_, this);
  this.ws_.onerror = goog.bind(this.onError_, this);
};

/**
 * @private
 */
BitEx.prototype.onOpen_ = function() {
  this.dispatchEvent(BitEx.EventType.OPENED);
};

/**
 * @private
 */
BitEx.prototype.onClose_ = function() {
  this.dispatchEvent(BitEx.EventType.CLOSED);
};

/**
 * @private
 */
BitEx.prototype.onError_ = function() {
  this.dispatchEvent(BitEx.EventType.ERROR);
};

/**
 * @param {*} e
 * @private
 */
BitEx.prototype.onMessage_ = function(e) {
  var msg = JSON.parse(e.data);

  this.dispatchEvent( new BitEx.BitExEvent( BitEx.EventType.RAW_MESSAGE, msg ) );

  switch( msg['MsgType'] ) {
    case '0':  //Heartbeat
      this.dispatchEvent( new BitEx.BitExEvent( BitEx.EventType.HEARTBEAT, msg ) );
      break;

    case 'BF': // Login response:
      if (msg['UserStatus'] == 1 ) {
        this.dispatchEvent( new BitEx.BitExEvent( BitEx.EventType.LOGIN_OK, msg ) );
      } else {
        this.dispatchEvent( new BitEx.BitExEvent( BitEx.EventType.LOGIN_ERROR, msg ) );
      }
      break;

    case 'U3': // Balance Response
      this.dispatchEvent( new BitEx.BitExEvent( BitEx.EventType.BALANCE_RESPONSE, msg ) );
      break;

    case 'U5': // Order List Response
      this.dispatchEvent( new BitEx.BitExEvent( BitEx.EventType.ORDER_LIST_RESPONSE, msg ) );
      break;

    case 'W':
      if ( msg['MarketDepth'] != 1 ) { // Has Market Depth
        this.dispatchEvent( new BitEx.BitExEvent( BitEx.EventType.ORDER_BOOK_CLEAR) );
        this.dispatchEvent( new BitEx.BitExEvent( BitEx.EventType.TRADE_CLEAR) );

        for ( var x in msg['MDFullGrp']) {
          var entry = msg['MDFullGrp'][x];

          switch (entry['MDEntryType']) {
            case '0': // Bid
            case '1': // Offer
              this.dispatchEvent( new BitEx.BitExEvent( BitEx.EventType.ORDER_BOOK_NEW_ORDER, entry) );
              break;
            case '2': // Trade
              this.dispatchEvent( new BitEx.BitExEvent( BitEx.EventType.TRADE, entry) );
              break;
          }
        }
      }
      this.dispatchEvent( new BitEx.BitExEvent( BitEx.EventType.MARKET_DATA_FULL_REFRESH, msg) );
      break;
    case 'X':
      if (msg['MDBkTyp'] == '3') {  // Order Depth
        for ( var x in msg['MDIncGrp']) {
          var entry = msg['MDIncGrp'][x];

          switch (entry['MDEntryType']) {
            case '0': // Bid
            case '1': // Offer
              switch( entry['MDUpdateAction'] ) {
                case '0':
                  this.dispatchEvent( new BitEx.BitExEvent( BitEx.EventType.ORDER_BOOK_NEW_ORDER, entry) );
                  break;
                case '1':
                  this.dispatchEvent( new BitEx.BitExEvent( BitEx.EventType.ORDER_BOOK_UPDATE_ORDER, entry) );
                  break;
                case '2':
                  this.dispatchEvent( new BitEx.BitExEvent( BitEx.EventType.ORDER_BOOK_DELETE_ORDER, entry) );
                  break;
                case '3':
                  this.dispatchEvent( new BitEx.BitExEvent( BitEx.EventType.ORDER_BOOK_DELETE_ORDERS_THRU, entry) );
                  break;
              }
              break;
            case '2': // Trade
              this.dispatchEvent( new BitEx.BitExEvent( BitEx.EventType.TRADE, entry) );
              break;
          }
        }
      } else {
        // TODO:  Top of the book handling.
      }
      this.dispatchEvent( new BitEx.BitExEvent( BitEx.EventType.MARKET_DATA_INCREMENTAL_REFRESH, msg) );
      break;
    case 'Y':
      this.dispatchEvent( new BitEx.BitExEvent( BitEx.EventType.MARKET_DATA_REQUEST_REJECT, msg) );
      break;

    case '8':  //Execution Report
      this.dispatchEvent( new BitEx.BitExEvent( BitEx.EventType.EXECUTION_REPORT, msg) );
      break;
  }
};


BitEx.prototype.close = function(){
  this.ws_.close();
  this.ws_ = null; // dereference the WebSocket
};

/**
 * @param {string} username
 * @param {string} password
 */
BitEx.prototype.login = function(username, password){
  var msg = {
    'MsgType': 'BE',
    'UserReqID': '1',
    'Username': username,
    'Password': password,
    'UserReqTyp': '1'
  };
  this.ws_.send(JSON.stringify( msg ));
};

/**
 * @param {string} password
 * @param {string} new_password
 */
BitEx.prototype.changePassword = function(password, new_password ){
  var msg = {
    'MsgType': 'BE',
    'UserReqID': '3',
    'Password': password,
    'NewPassword': new_password
  };
  this.ws_.send(JSON.stringify( msg ));
};

/**
 * @param {number} market_depth
 * @param {Array.<string>} symbols
 * @param {Array.<string>} entries
 * @return {number}
 */
BitEx.prototype.subscribeMarketData = function(market_depth, symbols, entries ){
  var reqId = parseInt(Math.random() * 1000000, 10);
  var msg = {
    'MsgType': 'V',
    'MDReqID': reqId,
    'SubscriptionRequestType': '1',
    'MarketDepth': market_depth,
    'MDUpdateType': '1',   // Incremental refresh
    'MDEntryTypes': entries,
    'Instruments': symbols
  };
  this.ws_.send(JSON.stringify( msg ));

  return reqId;
};

/**
 * @param {number} market_data_id
 */
BitEx.prototype.unSubscribeMarketData = function(market_data_id){
  var msg = {
    'MsgType': 'V',
    'MDReqID': market_data_id,
    'SubscriptionRequestType': '2'
  };
  this.ws_.send(JSON.stringify( msg ));
};



/**
 * @param {string} username
 * @param {string} password
 * @param {string} first_name
 * @param {string} last_name
 * @param {string} email
 */
BitEx.prototype.signUp = function(username, password, first_name, last_name, email ){
  var msg = {
    'MsgType': 'U0',
    'Username': username,
    'Password': password,
    'FirstName': first_name,
    'LastName': last_name,
    'Email': email
  };
  this.ws_.send(JSON.stringify( msg ));
};

/**
 * Request a list of open orders
 * @param {number=} opt_requestId. Defaults to random generated number
 */
BitEx.prototype.requestOpenOrders = function(opt_requestId){
  var requestId = opt_requestId || parseInt( 1e7 * Math.random() , 10 );

  var msg = {
    'MsgType': 'U4',
    'OpenOrdersReqID': requestId
  };
  this.ws_.send(JSON.stringify( msg ));

  return requestId;
};

/**
 *
 * @param {string} symbol
 * @param {number} qty
 * @param {number} price
 * @param {string} side
 * @param {number=} opt_clientOrderId. Defaults to random generated number
 * @param {string=} opt_orderType Defaults to Limited Order
 * @return {number}
 */
BitEx.prototype.sendOrder_ = function( symbol, qty, price, side, opt_clientOrderId, opt_orderType  ){
  var clientOrderId = opt_clientOrderId || parseInt( 1e7 * Math.random() , 10 );
  var orderType = '' + opt_orderType || '2';
  price = parseInt(price * 1e5, 10);
  qty = parseInt(qty * 1e8, 10);

  var msg = {
    'MsgType': 'D',
    'ClOrdID': '' + clientOrderId,
    'Symbol': symbol,
    'Side': side,
    'OrdType': orderType,
    'Price': price,
    'OrderQty': qty
  };

  this.ws_.send(JSON.stringify( msg ));

  return clientOrderId;
};

/**
 * @param {string} opt_clientOrderId
 * @param {string} opt_OrderId
 */
BitEx.prototype.cancelOrder = function( opt_clientOrderId, opt_OrderId  ) {
  var msg = {
    'MsgType': 'F'
  };

  if (opt_clientOrderId) {
    msg['OrigClOrdID'] = opt_clientOrderId;
  } else if (opt_OrderId) {
    msg['OrderID'] = opt_OrderId;
  }

  this.ws_.send(JSON.stringify( msg ));
};

/**
 * @param {Object} msg
 */
BitEx.prototype.sendRawMessage  = function(msg) {
  this.ws_.send(JSON.stringify( msg ));
};

/**
 * Send a buy order
 * @param {string} symbol
 * @param {number} qty
 * @param {number} price
 * @param {number=} opt_clientOrderId. Defaults to random generated number
 * @return {number}
 */
BitEx.prototype.sendBuyLimitedOrder = function( symbol, qty, price, opt_clientOrderId  ){
  return this.sendOrder_(symbol, qty, price, '1', opt_clientOrderId, '2');
};

/**
 * Send a sell order
 * @param {string} symbol
 * @param {number} qty
 * @param {number} price
 * @param {number=} opt_clientOrderId. Defaults to random generated number
 * @return {number}
 */
BitEx.prototype.sendSellLimitedOrder = function( symbol, qty, price, opt_clientOrderId  ){
  return this.sendOrder_(symbol, qty, price, '2', opt_clientOrderId, '2');
};

/**
 * Send a test request message, to test the connection
 */
BitEx.prototype.testRequest = function(){
  var msg = {
    'MsgType': '1',
    'TestReqID': Math.random()
  };
  this.ws_.send(JSON.stringify( msg ));
};


/**
 *
 * @param {string} type
 * @param {Object=} opt_data
 * @extends {goog.events.Event}
 * @constructor
 */
BitEx.BitExEvent = function(type, opt_data) {
  goog.events.Event.call(this, type);

  /**
   * The new message from the web socket.
   * @type {Object|null|undefined}
   */
  this.data = opt_data;
};
goog.inherits(BitEx.BitExEvent, goog.events.Event);

