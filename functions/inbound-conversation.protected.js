const jwt = require('jsonwebtoken');
const jsforce = require('jsforce');
const axios = require('axios');
var querystring = require('querystring');

exports.handler = async function (context, event, callback) {
    const twilioClient = context.getTwilioClient();
    let response = new Twilio.Response();
    response.appendHeader('Content-Type', 'application/json');
    switch (event.EventType) {
        case 'onConversationAdd': {
            const customerNumber = event['MessagingBinding.Address'];
            const isIncomingConversation = !!customerNumber;
            if (isIncomingConversation) {
                const sfdcConn = await authenticate(context);
                const customerDetails = await getCustomerByNumber(customerNumber, sfdcConn) || {};
                const conversationProperties = {
                    friendly_name: customerDetails.display_name || customerNumber,
                    // attributes: JSON.stringify({
                    //     avatar: customerDetails.avatar
                    // })
                };
                console.log('Responding with: ' + JSON.stringify(conversationProperties));
                response.setBody(conversationProperties);
            }
            break;
        } case 'onParticipantAdded': {
            const conversationSid = event.ConversationSid;
            const participantSid = event.ParticipantSid;
            const customerNumber = event['MessagingBinding.Address'];
            const isCustomer = customerNumber && !event.Identity;
            if (isCustomer) {
                const customerParticipant = await twilioClient.conversations
                    .conversations(conversationSid)
                    .participants
                    .get(participantSid)
                    .fetch();
                const sfdcConn = await authenticate(context);
                const customerDetails = await getCustomerByNumber(customerNumber, sfdcConn) || {};
                await setCustomerParticipantProperties(customerParticipant, customerDetails);
            }
            break;
        } default: {
            console.log('Unknown event type: ', event.EventType);
            response.setStatusCode(422);
        }
    }
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

const getCustomerByNumber = async (number, sfdcConn) => {
    console.log('Getting Customer details by #: ', number);
    let sfdcRecords = [];
    try {
        sfdcRecords = await sfdcConn.sobject("Contact")
            .find(
                {
                    'MobilePhone': number
                },
                {
                    Id: 1,
                    Name: 1,
                }
            )
            .sort({ LastModifiedDate: -1 })
            .limit(1)
            .execute();
        console.log("Fetched # SFDC records: " + sfdcRecords.length);
    } catch (err) {
        console.error(err);
    }
    const sfdcRecord = sfdcRecords[0];
    return {
        display_name: sfdcRecord.Name,
        customer_id: sfdcRecord.Id
    }
};

const setCustomerParticipantProperties = async (customerParticipant, customerDetails) => {
    const participantAttributes = JSON.parse(customerParticipant.attributes);
    const customerProperties = {
        attributes: JSON.stringify({
            ...participantAttributes,
            // avatar: participantAttributes.avatar || customerDetails.avatar,
            customer_id: participantAttributes.customer_id || customerDetails.customer_id,
            display_name: participantAttributes.display_name || customerDetails.display_name
        })
    };

    // If there is difference, update participant
    if (customerParticipant.attributes !== customerProperties.attributes) {
        // Update attributes of customer to include customer_id
        await customerParticipant
            .update(customerProperties)
            .catch(e => console.log("Update customer participant failed: ", e));
    }
}