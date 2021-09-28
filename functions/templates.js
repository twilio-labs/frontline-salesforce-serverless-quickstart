const validateTokenPath = Runtime.getFunctions()['auth/frontline-validate-token'].path;

const { validateToken } = require(validateTokenPath);

exports.handler = async function (context, event, callback) {
  let response = new Twilio.Response();
  response.appendHeader('Content-Type', 'application/json');
  try {
    const tokenInfo = await validateToken(context, event.Token);
    console.log('Frontline token user identity: ' + tokenInfo.identity);
    if (tokenInfo.identity === event.Worker) {
      switch (event.location) {
        case 'GetTemplatesByCustomerId': {
          response.setBody(
            [
              getTemplatesByCustomerId(event.CustomerId)
            ]
          );
          break;
        } default: {
          console.log('Unknown location: ', event.location);
          res.setStatusCode(422);
        }
      }
      return callback(null, response);
    } else {
      console.error(`Worker in request: ${event.Worker}; 
        identity in token: ${tokenInfo.identity}`);
      response.setStatusCode(403);
      return callback(null, response);
    }
  } catch (e) {
    console.error(e);
    response.setStatusCode(500);
    return callback(null, response);
  }
};

const getTemplatesByCustomerId = (contactId) => {
  console.log('Getting Customer templates: ', contactId);
  return {
    display_name: 'Meeting Reminders',
    templates: [
      { "content": MEETING_CONFIRM_TODAY, whatsAppApproved: true },
      { "content": MEETING_CONFIRM_TOMORROW }
    ]
  };
};

const getTodaysDate = () => {
  const today = new Date();
  console.log(today.toDateString());
  return today.toDateString();
};

const getTomorrowsDate = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  console.log(tomorrow.toDateString());
  return tomorrow.toDateString();
};

const MEETING_CONFIRM_TODAY = `Just a reminder that our meeting is scheduled for today on ${getTodaysDate()}`;
const MEETING_CONFIRM_TOMORROW = `Just a reminder that our meeting is scheduled for tomorrow on ${getTomorrowsDate()}`;