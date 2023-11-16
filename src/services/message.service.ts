import { NEYNAR_SIGNER_UUID, NEYNAR_TOKEN } from '@/config';
import { CreateMessageDto } from '@/dtos/messages.dto';
import { HttpException } from '@/exceptions/HttpException';
import { Message } from '@/interfaces/messages.interface';
import { MessageModel } from '@/models/messages.model';
import { MESSAGE_VERSION } from '@/utils/constants';
import { extractData } from '@/utils/noir';
import { NeynarAPIClient } from '@standard-crypto/farcaster-js';
import { BarretenbergBackend } from '@noir-lang/backend_barretenberg';
import { Noir } from '@noir-lang/noir_js';
import { Service } from 'typedi';
import {v4 as uuidv4} from 'uuid';

import circuit from '@/circuit/main.json';


@Service()
export class MessageService {
  private async cast(text: string) {
    const client = new NeynarAPIClient(NEYNAR_TOKEN);

    return client.v2.publishCast(
      NEYNAR_SIGNER_UUID,
      text
    );
  }

  public async createMessage(
    messageData: CreateMessageDto
  ): Promise<Message> {
    const inputs = extractData(messageData.publicInputs);

    // Check message does not exists yet
    const findMessage: Message = await MessageModel.query()
      .select().from('messages')
      .where('text', '=', inputs.text).first();

    if (findMessage) throw new HttpException(409, `This message already exists`);

    // Validate timestamp

    // Verify proof
    // @ts-ignore
    const backend = new BarretenbergBackend(circuit);
    // @ts-ignore
    const noir = new Noir(circuit, backend);

    await backend.instantiate();
    await backend['api'].acirInitProvingKey(
      backend['acirComposer'],
      backend['acirUncompressedBytecode']
    );

    // @ts-ignore
    const verification = await noir.verifyFinalProof(messageData);

    if (!verification) throw new HttpException(409, `Proof is not valid`);

    // Cast message
    const {
      hash: farcaster_hash
    } = await this.cast(inputs.text);

    const createMessageData: Message = await MessageModel.query()
      .insert({
        id: uuidv4(),
        timestamp: new Date(inputs.timestamp * 1000).toISOString(),
        text: inputs.text,
        version: MESSAGE_VERSION,
        proof: {
          proof: messageData.proof,
          publicInputs: messageData.publicInputs
        },
        farcaster_hash,
      }).into('messages');

    return createMessageData;
  }

  public async findMessageById(
    messageId: string
  ): Promise<Message> {
    const findMessage: Message = await MessageModel.query().findById(messageId);

    if (!findMessage) throw new HttpException(409, "Message doesn't exist");

    return findMessage;
  }

  public async findMessageByFarcasterHash(
    farcaster_hash: string
  ): Promise<Message> {
    const findMessage = await MessageModel.query()
      .select().from('messages')
      .where('farcaster_hash', 'like', `${farcaster_hash}%`).first();

    if (!findMessage) throw new HttpException(409, "Message doesn't exist");

    return findMessage;
  }
}