const jwt = require('jsonwebtoken');
const jsforce = require('jsforce');
const axios = require('axios');
var querystring = require('querystring');

exports.handler = async function (context, event, callback) {
  let response = new Twilio.Response();
  response.appendHeader('Content-Type', 'application/json');
  try {
    const tokenInfo = await validateToken(context, event.Token);
    console.log('Frontline token user identity: ' + tokenInfo.identity);
    if (event.Anchor) { // workaround to avoid pagination
      response.setBody([]);
      return callback(null, response);
    } else if (tokenInfo.identity === event.Worker) {
      const connection = await authenticate(context);
      const identityInfo = await connection.identity();
      console.log('Connected as SF user:' + identityInfo.username);
      switch (event.location) {
        case 'GetCustomerDetailsByCustomerId': {
          response.setBody(
            await getCustomerDetailsByCustomerIdCallback(
              event.CustomerId,
              connection)
          );
          break;
        }
        case 'GetCustomersList': {
          response.setBody(
            await getCustomersListCallback(
              //event.PageSize, // not currently handling pagination
              tokenInfo.identity,
              connection)
          );
          break;
        }
        default: {
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

const authenticate = async (context) => {
  const threeMinutesFromNowInSeconds = Math.floor(Date.now() / 1000) + 3 * 60;
  const claim = {
    iss: context.SF_CONSUMER_KEY,
    aud: 'https://login.salesforce.com',
    prn: context.SF_USERNAME,
    exp: threeMinutesFromNowInSeconds
  };
  const openKey = Runtime.getAssets()['/server.key'].open;
  const key = openKey();
  const jwtToken = jwt.sign(claim, key, { algorithm: 'RS256' });
  const params = {
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwtToken
  };
  try {
    const response = await axios.post(
      'https://login.salesforce.com/services/oauth2/token',
      querystring.stringify(params),
    );
    const credentials = response.data;
    const connection = new jsforce.Connection({
      accessToken: credentials.access_token,
      instanceUrl: credentials.instance_url
    });
    return connection;
  } catch (e) {
    console.error(e);
  }
}

const validateToken = async (context, token) => {
  const response = await axios.post(
    `https://iam.twilio.com/v2/Tokens/validate/${context.SSO_REALM_SID}`,
    {
      token,
    },
    {
      headers: {
        "Content-Type": "application/json",
      },
      auth: {
        username: context.ACCOUNT_SID,
        password: context.AUTH_TOKEN
      },
    }
  );
  return { identity: response.data.realm_user_id };
};

const getCustomerDetailsByCustomerIdCallback = async (contactId, connection) => {
  console.log('Getting Customer details: ', contactId);
  let sfdcRecords = [];
  try {
    sfdcRecords = await connection.sobject("Contact")
      .find(
        {
          'Id': contactId
        },
        {
          Id: 1,
          Name: 1,
          Title: 1,
          MobilePhone: 1,
          'Account.Name': 1,
        }
      )
      .limit(1)
      .execute();
    console.log("Fetched # SFDC records: " + sfdcRecords.length);
  } catch (err) {
    console.error(err);
  }
  const sfdcRecord = sfdcRecords[0];

  const accountName = (
    sfdcRecord.Account ? sfdcRecord.Account.Name : 'Unknown Company'
  );

  return {
    objects: {
      customer: {
        customer_id: sfdcRecord.Id,
        display_name: sfdcRecord.Name,
        channels: [
          {
            type: 'sms',
            value: sfdcRecord.MobilePhone
          },
          {
            type: 'whatsapp',
            value: `whatsapp:${sfdcRecord.MobilePhone}`
          },
          {
            type: 'email',
            value: sfdcRecord.Email
          }
        ],
        // links: customerDetails.links,
        // avatar: customerDetails.avatar,
        details: {
          title: "Information",
          content: `${accountName} - ${sfdcRecord.Title}`
        }
      }
    }
  }
};

const getCustomersListCallback = async (workerIdentity, connection) => {
  let sfdcRecords = [];
  try {
    sfdcRecords = await connection.sobject("Contact")
      .find(
        {
          'Owner.Email': workerIdentity
        },
        {
          Id: 1,
          Name: 1,
        }
      )
      .sort({ Name: 1 })
      .limit(2000)
      .execute();
    console.log("Fetched # SFDC records: " + sfdcRecords.length);
  } catch (err) {
    console.error(err);
  }

  const list = sfdcRecords.map(contact => ({
    display_name: contact.Name,
    customer_id: contact.Id,
    // avatar: customer.avatar
  }));

  return {
    objects:
    {
      customers: list
    }
  };
};