const sfdcAuthenticatePath = Runtime.getFunctions()['auth/sfdc-authenticate'].path;

const { sfdcAuthenticate } = require(sfdcAuthenticatePath);

exports.handler = async function (context, event, callback) {
    const twilioClient = context.getTwilioClient();
    let response = new Twilio.Response();
    response.appendHeader('Content-Type', 'application/json');
    switch (event.EventType) {
        case 'onConversationAdd': {
            const customerNumber = event['MessagingBinding.Address'];
            const isIncomingConversation = !!customerNumber;
            if (isIncomingConversation) {
                const sfdcConn = await sfdcAuthenticate(context);
                const customerDetails = await getCustomerByNumber(customerNumber, sfdcConn) || {};
                const conversationProperties = {
                    friendly_name: customerDetails.display_name || customerNumber,
                };
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
                const sfdcConn = await sfdcAuthenticate(context);
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
        console.log("Fetched # SFDC records for contact by #: " + sfdcRecords.length);
        if (sfdcRecords.length === 0) {
            return;
        }
        const sfdcRecord = sfdcRecords[0];
        return {
            display_name: sfdcRecord.Name,
            customer_id: sfdcRecord.Id
        }
    } catch (err) {
        console.error(err);
    }
};

const setCustomerParticipantProperties = async (customerParticipant, customerDetails) => {
    const participantAttributes = JSON.parse(customerParticipant.attributes);
    const customerProperties = {
        attributes: JSON.stringify({
            ...participantAttributes,
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