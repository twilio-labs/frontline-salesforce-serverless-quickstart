const sfdcAuthenticatePath = Runtime.getFunctions()['auth/sfdc-authenticate'].path;
const { sfdcAuthenticate } = require(sfdcAuthenticatePath);

exports.handler = async function (context, event, callback) {
    const twilioClient = context.getTwilioClient();
    let response = new Twilio.Response();
    response.appendHeader('Content-Type', 'application/json');
    const conversationSid = event.ConversationSid;
    const workerNumber = event['MessagingBinding.ProxyAddress'];
    const sfdcConnectionIdentity = await sfdcAuthenticate(context, null); // this is null due to no user context, default to env. var SF user
    const { connection } = sfdcConnectionIdentity;
    await routeConversation(context, twilioClient, conversationSid, workerNumber, connection);
    return callback(null, response);
};

const routeConversation = async (context, twilioClient, conversationSid,
    workerNumber, sfdcConn) => {
    let workerIdentity = await getContactOwnerByNumber(workerNumber, sfdcConn);
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
        // Use below query if looking up Worker identity based on Twilio proxy #
        sfdcRecords = await sfdcConn.sobject("User")
            .find(
                {
                    'MobilePhone': number
                },
                {
                    'Username': 1,
                }
            )
            .sort({ LastModifiedDate: -1 })
            .limit(1)
            .execute();
        /* Use below query if looking up Contact owner by Contact phone #
        sfdcRecords = await sfdcConn.sobject("Contact")
            .find(
                {
                    'MobilePhone': number
                },
                {
                    'Owner.Username': 1,
                }
            )
            .sort({ LastModifiedDate: -1 })
            .limit(1)
            .execute();
        */
        console.log("Fetched # SFDC records for contact owner by #: " + sfdcRecords.length);
        if (sfdcRecords.length === 0) {
            return;
        }
        const sfdcRecord = sfdcRecords[0];
        console.log('Matched to worker: ' + sfdcRecord.Username);
        return sfdcRecord.Username;
    } catch (err) {
        console.error(err);
    }
};