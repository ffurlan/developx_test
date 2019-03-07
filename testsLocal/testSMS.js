var twilio = require('twilio');

/// Sends a SMS message to a given number
var sendSms = function(to, message)
{
    var accountSid = 'AC9eb0ddedeabf78f9103090ae68cdcf0d';// 'ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'; // Your Account SID from www.twilio.com/console
    var authToken = '963cb14c26b76d2689afd3d0a37f08ac'; //'your_auth_token';   // Your Auth Token from www.twilio.com/console  
    var from = '+15188628177';
    
    var client = new twilio(accountSid, authToken);
    
    return client.messages.create({
        body: message,
        to: to,//'+12345678901',  // Text this number
        from: from
    })
    .then((message) => {
      console.log('[SMS] Sent SMS message to number %s and the Message SID is %s', to, message.sid)
      //logger.debug('[SMS] Sent SMS message to number %s and the Message SID is %s', to, message.sid)
      return message;
    })
    .catch(error =>{
      console.log("[SMS] Error sending message to %s",to,error)
      //console.log(error);
    });
}

//sendSms('+55 19 97130-7211', 'furlan seu viadinho!!!!! vou te dar um liqco que cai pinto!');
//sendSms('+5511981812788', 'furlan seu viadinho!!!!! vou te dar um liqco que cai pinto!');
//sendSms('+5519984479963', 'furlan seu viadinho!!!!! vou te dar um liqco que cai pinto!');
sendSms('+55 19 99773-7791', 'furlan seu viadinho!!!!! vou te dar um liqco que cai pinto!');