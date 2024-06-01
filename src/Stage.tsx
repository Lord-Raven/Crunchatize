import {ReactElement} from "react";
import {StageBase, StageResponse, InitialData, Message, ImpersonateRequest, DEFAULT_IMPERSONATION, MessagingResponse, MessageResponse, DEFAULT_NUDGE_REQUEST, NudgeRequest, EnvironmentRequest} from "@chub-ai/stages-ts";
import {LoadResponse} from "@chub-ai/stages-ts/dist/types/load";
import {Action} from "./Action";
import {Stat, StatDescription} from "./Stat"
import {Outcome, ResultDescription} from "./Outcome";
import {sendMessageAndAwait} from "@chub-ai/stages-ts/dist/services/messaging";
import {MESSAGING_REQUESTS} from "@chub-ai/stages-ts/dist/types/messaging/constants";

/***
 The type that this stage persists message-level state in.
 This is primarily for readability, and not enforced.

 @description This type is saved in the database after each message,
  which makes it ideal for storing things like positions and statuses,
  but not for things like history, which is best managed ephemerally
  in the internal state of the Stage class itself.
 ***/
type MessageStateType = any;

/***
 The type of the stage-specific configuration of this stage.

 @description This is for things you want people to be able to configure,
  like background color.
 ***/
type ConfigType = any;

/***
 The type that this stage persists chat initialization state in.
 If there is any 'constant once initialized' static state unique to a chat,
 like procedurally generated terrain that is only created ONCE and ONLY ONCE per chat,
 it belongs here.
 ***/
type InitStateType = any;

/***
 The type that this stage persists dynamic chat-level state in.
 This is for any state information unique to a chat,
    that applies to ALL branches and paths such as clearing fog-of-war.
 It is usually unlikely you will need this, and if it is used for message-level
    data like player health then it will enter an inconsistent state whenever
    they change branches or jump nodes. Use MessageStateType for that.
 ***/
type ChatStateType = any;

/***
 A simple example class that implements the interfaces necessary for a Stage.
 If you want to rename it, be sure to modify App.js as well.
 @link https://github.com/CharHubAI/chub-stages-ts/blob/main/src/types/stage.ts
 ***/
export class Stage extends StageBase<InitStateType, ChatStateType, MessageStateType, ConfigType> {

    readonly defaultStat: number = 0;
    readonly actionPrompt: string = 'Develop an excerpt of organic narration. At the end of this passage, divise and append three or four varied, stat-oriented, active follow-up suggestions that the user could choose to take, always formatted in this fashion:\n' +
        '(Stat +Modifier) Brief summary of action\n' +
        '"Stat" is one of these eight core stats:\n' +
        Object.keys(Stat).map(key => `${key}: ${StatDescription[key as Stat]}`).join('\n') +
        'And "Modifier" is a relative difficulty modifier between -5 and 5 which will be added to the skill check result; a lower number reflects a more difficult task.\n' +
        'Place each option on a separate line. Study the stat descriptions for inspiration and consider the characters\' current situations and assets. Here are sample options:\n' +
        '(Might +1) Force the lock\n' +
        '(Skill -1) Pick the lock (it looks difficult)\n' +
        '(Grace +0) Scale the wall\n' +
        '(Charm -2) Convince someone to give you the key';

    // Regular expression to match the pattern "(Stat +modifier) description"
    readonly actionRegex = /\((\w+)\s+([\+\-]\d+)\)\s+(.+)/;
    
    stats: {[key: string]: number} = {};
    currentMessage: string = '';
    actions: Action[] = [];
    currentMessageId: string|undefined = undefined;
    lastOutcome: Outcome|null = null;
    lastOutcomePrompt: string = '';
    promptForId: string|undefined = undefined;
    playerId: string;
    botId: string;

    constructor(data: InitialData<InitStateType, ChatStateType, MessageStateType, ConfigType>) {
        /***
         This is the first thing called in the stage,
         to create an instance of it.
         The definition of InitialData is at @link https://github.com/CharHubAI/chub-stages-ts/blob/main/src/types/initial.ts
         Character at @link https://github.com/CharHubAI/chub-stages-ts/blob/main/src/types/character.ts
         User at @link https://github.com/CharHubAI/chub-stages-ts/blob/main/src/types/user.ts
         ***/
        super(data);
        const {
            characters,         // @type:  { [key: string]: Character }
            users,                  // @type:  { [key: string]: User}
            config,                                 //  @type:  ConfigType
            messageState,                           //  @type:  MessageStateType
            environment,                     // @type: Environment (which is a string)
            initState,                             // @type: null | InitStateType
            chatState                              // @type: null | ChatStateType
        } = data;
        this.setStateFromMessageState(messageState);
        this.playerId = users[Object.keys(users)[0]].anonymizedId;
        this.botId = characters[Object.keys(characters)[0]].anonymizedId;
    }

    async load(): Promise<Partial<LoadResponse<InitStateType, ChatStateType, MessageStateType>>> {
        /***
         This is called immediately after the constructor, in case there is some asynchronous code you need to
         run on instantiation.
         ***/
        return {
            /*** @type boolean @default null
             @description The 'success' boolean returned should be false IFF (if and only if), some condition is met that means
              the stage shouldn't be run at all and the iFrame can be closed/removed.
              For example, if a stage displays expressions and no characters have an expression pack,
              there is no reason to run the stage, so it would return false here. ***/
            success: true,
            /*** @type null | string @description an error message to show
             briefly at the top of the screen, if any. ***/
            error: null,
            initState: null,
            chatState: null,
        };
    }

    async setState(state: MessageStateType): Promise<void> {
        /***
         This can be called at any time, typically after a jump to a different place in the chat tree
         or a swipe. Note how neither InitState nor ChatState are given here. They are not for
         state that is affected by swiping.
         ***/
        console.log('setState');
        console.log(state);
        console.log('pre-state-parent-id:' + this.currentMessageId);
        this.setStateFromMessageState(state);
        console.log('post-state-parent-id' + this.currentMessageId);
    }

    async beforePrompt(userMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {
        /***
         This is called after someone presses 'send', but before anything is sent to the LLM.
         ***/
        const {
            content,            /*** @type: string
             @description Just the last message about to be sent. ***/
            anonymizedId,       /*** @type: string
             @description An anonymized ID that is unique to this individual
              in this chat, but NOT their Chub ID. ***/
            isBot,             /*** @type: boolean
             @description Whether this is itself from another bot, ex. in a group chat. ***/
            promptForId,       /*** @type: string
             @description The anonymized ID of the bot or human being prompted, if any.
                            Essentially only relevant to beforePrompt currently. ***/
            identity
        } = userMessage;

        console.log('beforePrompt:' + promptForId + ';' + identity);
        this.promptForId = promptForId ?? undefined;
        this.currentMessageId = identity;

        let errorMessage: string|null = null;
        let takenAction: Action|null = null;
        let finalContent: string|undefined = content;

        // Attempt to parse actions:
        for (const action of this.actions) {
            if (content.toLowerCase().includes(action.stat.toLowerCase())) {
                console.log('found action');
                takenAction = action;
                break;
            }
        }

        if (takenAction) {
            this.setLastOutcome(takenAction.determineSuccess(this.stats[takenAction.stat]));
            finalContent = this.lastOutcome?.getDescription();
        } else if (this.actions.length > 0) {
            console.log('No action--error time!');
            errorMessage = 'You must choose one of the offered actions.';
            throw new Error('Invalid action');
        }

        return {
            /*** @type null | string @description A string to add to the
             end of the final prompt sent to the LLM,
             but that isn't persisted. ***/
            stageDirections: `\n[${this.lastOutcomePrompt}\n${this.actionPrompt}]`,
            /*** @type MessageStateType | null @description the new state after the userMessage. ***/
            messageState: this.buildMessageState(),
            /*** @type null | string @description If not null, the user's message itself is replaced
             with this value, both in what's sent to the LLM and in the database. ***/
            modifiedMessage: finalContent,
            /*** @type null | string @description A system message to append to the end of this message.
             This is unique in that it shows up in the chat log and is sent to the LLM in subsequent messages,
             but it's shown as coming from a system user and not any member of the chat. If you have things like
             computed stat blocks that you want to show in the log, but don't want the LLM to start trying to
             mimic/output them, they belong here. ***/
            systemMessage: null,
            /*** @type null | string @description an error message to show
             briefly at the top of the screen, if any. ***/
            error: errorMessage,
            chatState: null,
        };
    }

    async afterResponse(botMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {
        /***
         This is called immediately after a response from the LLM.
         ***/
        const {
            content,            /*** @type: string
             @description The LLM's response. ***/
            anonymizedId,       /*** @type: string
             @description An anonymized ID that is unique to this individual
              in this chat, but NOT their Chub ID. ***/
            isBot,             /*** @type: boolean
             @description Whether this is from a bot, conceivably always true. ***/
            identity           /*** @type: string
             @description The unique ID of this chat message. ***/
        } = botMessage;

        console.log('afterResponse()');
        this.lastOutcomePrompt =  '';
        
        const lines = content.split('\n');
        let contentLines = [];
        this.actions = [];
        

        for (const line of lines) {
            const match = line.match(this.actionRegex);
            if (match) {
                console.log('Have an action: ' + match[3] + ';' + match[1] + ';' + match[2]);
                this.actions.push(new Action(match[3], match[1] as Stat, Number(match[2])));
            } else {
                // If the line does not match the pattern, it's a content line
                contentLines.push(line);
            }
        }
        
        // Join the content lines back into a single string
        const finalContent = contentLines.join('\n');

        this.currentMessage = finalContent;
        this.currentMessageId = identity;
        console.log(this.currentMessageId);


        return {
            /*** @type null | string @description A string to add to the
             end of the final prompt sent to the LLM,
             but that isn't persisted. ***/
            stageDirections: null,
            /*** @type MessageStateType | null @description the new state after the botMessage. ***/
            messageState: this.buildMessageState(),
            /*** @type null | string @description If not null, the bot's response itself is replaced
             with this value, both in what's sent to the LLM subsequently and in the database. ***/
            modifiedMessage: finalContent,
            /*** @type null | string @description an error message to show
             briefly at the top of the screen, if any. ***/
            error: null,
            systemMessage: this.actions.length > 0 ? this.actions.map(action => action.fullDescription()).join('\n') : null,
            chatState: null
        };
    }


    setStateFromMessageState(messageState: MessageStateType) {
        this.stats = {};
        if (messageState != null) {
            for (let stat in Stat) {
                this.stats[stat] = messageState[stat] ?? this.defaultStat;
            }
            this.currentMessage= messageState['currentMessage'] ?? '';
            this.currentMessageId = messageState['currentMessageId'] ?? '';
            this.lastOutcome = messageState['lastOutcome'] ? this.convertOutcome(messageState['lastOutcome']) : null;
            this.lastOutcomePrompt = messageState['lastOutcomePrompt'] ?? '';
            this.actions = messageState['actions'] ? messageState['actions'].map((action: any) => {
                return this.convertAction(action);
            }) : [];
            this.promptForId = messageState['promptForId'];
        }
    }

    convertOutcome(input: any): Outcome {
        return new Outcome(input['dieResult1'], input['dieResult2'], this.convertAction(input['action']));
    }
    convertAction(input: any): Action {
        return new Action(input['description'], input['stat'] as Stat, input['modifier'])
    }

    buildMessageState(): any {
        let messageState: {[key: string]: any} = {};
        for (let stat in Stat) {
            messageState[stat] = this.stats[stat] ?? this.defaultStat;
        }
        messageState['currentMessage'] = this.currentMessage ?? '';
        messageState['currentMessageId'] = this.currentMessageId ?? '';
        messageState['lastOutcome'] = this.lastOutcome ?? null;
        messageState['lastOutcomePrompt'] = this.lastOutcomePrompt ?? '';
        messageState['actions'] = this.actions ?? [];
        messageState['promptForId'] = this.promptForId;
        return messageState;
    }

    async chooseAction(action: Action) {
        console.log('taking an action: ' + this.promptForId + ":" + this.currentMessageId);
        this.messenger.updateEnvironment({
            input_enabled: false
        });
        this.setLastOutcome(action.determineSuccess(this.stats[action.stat]));

        // Impersonate player with result
        let impersonateRequest: ImpersonateRequest = DEFAULT_IMPERSONATION;
        impersonateRequest.is_main = true;
        impersonateRequest.speaker_id = this.playerId;
        impersonateRequest.parent_id = this.currentMessageId ?? null;
        impersonateRequest.message = this.lastOutcome?.getDescription() ?? '';
        console.log(impersonateRequest);
        const impersonateResponse: MessageResponse = await this.messenger.impersonate(impersonateRequest);
        this.currentMessageId = impersonateResponse.identity;
        this.setState(this.buildMessageState());
        sendMessageAndAwait<MessageResponse>('BEFORE', impersonateResponse);
        console.log('after sendMessageAndAwait');
        
/*
        // Nudge bot for narration?
        let nudgeRequest: NudgeRequest = DEFAULT_NUDGE_REQUEST;
        nudgeRequest.parent_id = this.currentMessageId;
        nudgeRequest.stage_directions = `\n[${this.lastOutcomePrompt}\n${this.actionPrompt}]`;
        nudgeRequest.speaker_id = this.botId;
        nudgeRequest.is_main = false;
        console.log(nudgeRequest);
        const nudgeResponse: MessageResponse = await this.messenger.nudge(nudgeRequest);
        this.currentMessageId = nudgeResponse.identity;
        console.log('Done with nudge');*/
        this.messenger.updateEnvironment({
            input_enabled: true,
        });
    }

    setLastOutcome(outcome: Outcome|null) {
        this.lastOutcome = outcome;
        this.lastOutcomePrompt = '';
        if (this.lastOutcome) {
            this.lastOutcomePrompt += `The user has chosen the following action: ${this.lastOutcome.action.description}\n`;
            this.lastOutcomePrompt += `${ResultDescription[this.lastOutcome.result]}\n`
        }
    }
    
    render(): ReactElement {
        return <div style={{
            width: '100vw',
            height: '100vh',
            display: 'grid',
            alignItems: 'stretch'
        }}>
            <div>{this.currentMessage}</div>
            <div>{this.actionPrompt}</div>
            <div>
                Select an action:<br/>
                {this.actions.map((action: Action) => action.render(this))}
            </div>

        </div>;
    }

}
