const jwt = require('jsonwebtoken');
const jsforce = require('jsforce');
const axios = require('axios');
var querystring = require('querystring');

exports.handler = async function (context, event, callback) {
    const twilioClient = context.getTwilioClient();
    let response = new Twilio.Response();
    response.appendHeader('Content-Type', 'application/json');
    const conversationSid = event.ConversationSid;
    const customerNumber = event['MessagingBinding.Address'];
    const sfdcConn = await authenticate(context);
    await routeConversation(context, twilioClient, conversationSid, customerNumber, sfdcConn);
    return callback(null, response);
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
        const sfdcConn = new jsforce.Connection({
            accessToken: credentials.access_token,
            instanceUrl: credentials.instance_url
        });
        return sfdcConn;
    } catch (e) {
        console.error(e);
    }
}

const routeConversation = async (context, twilioClient, conversationSid,
    customerNumber, sfdcConn) => {
    let workerIdentity = await getContactOwnerByNumber(customerNumber, sfdcConn);
    if (!workerIdentity) { // Customer doesn't have a worker
        // Select a default worker
        workerIdentity = context.DEFAULT_WORKER;
    }
    await routeConversationToWorker(twilioClient, conversationSid, workerIdentity);
}

const routeConversationToWorker = async (twilioClient, conversationSid, workerIdentity) => {
    // Add worker to the conversation with a customer
    console.log('Conversation SID: ', conversationSid);
    const participant = await twilioClient.conversations
        .conversations(conversationSid)
        .participants
        .create({ identity: workerIdentity });
    console.log('Created agent participant: ', participant.sid);
}

const getContactOwnerByNumber = async (number, sfdcConn) => {
    console.log('Getting Contact Owner by #: ', number);
    let sfdcRecords = [];
    try {
        sfdcRecords = await sfdcConn.sobject("Contact")
            .find(
                {
                    'MobilePhone': number
                },
                {
                    'Owner.Email': 1,
                }
            )
            .sort({ LastModifiedDate: -1 })
            .limit(1)
            .execute();
        console.log("Fetched # SFDC records for contact owner by #: " + sfdcRecords.length);
        if (sfdcRecords.length === 0) {
            return;
        }
        const sfdcRecord = sfdcRecords[0];
        console.log('Matched to worker: ' + sfdcRecord.Owner.Email);
        return sfdcRecord.Owner.Email;
    } catch (err) {
        console.error(err);
    }
  
};