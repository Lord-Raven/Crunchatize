import {ReactElement} from "react";
import {StageBase, StageResponse, InitialData, Message, ImpersonateRequest, DEFAULT_IMPERSONATION, MessagingResponse, MessageResponse, DEFAULT_NUDGE_REQUEST, NudgeRequest, EnvironmentRequest, TextGenRequest} from "@chub-ai/stages-ts";
import {LoadResponse} from "@chub-ai/stages-ts/dist/types/load";
import {Action} from "./Action";
import {Stat, StatDescription} from "./Stat"
import {Outcome, Result, ResultDescription} from "./Outcome";
import {sendMessageAndAwait} from "@chub-ai/stages-ts/dist/services/messaging";
import * as actionSchema from './assets/jsonSchema.json';

type MessageStateType = any;

type ConfigType = any;

type InitStateType = any;

type ChatStateType = any;

export class Stage extends StageBase<InitStateType, ChatStateType, MessageStateType, ConfigType> {

    readonly ACTION_JSON_SCHEMA: string = JSON.stringify(actionSchema);
    
    readonly defaultStat: number = 0;
    readonly adLibPrompt: string = 'Determine whether the preceding input includes action or motivated dialog. \n' +
        'If so, determine and output the name of the stat that best governs the action or intent, as well as a relative difficulty modifier between -5 and +5.\n' +
        'These are the eight possible stats and their descriptions, to aid in selecting the most applicable:\n' +
        Object.keys(Stat).map(key => `${key}: ${StatDescription[key as Stat]}`).join('\n') + '\n' +
        'Sample responses:\n"Might +1", "Skill -2", "Grace +0", or "None"';
    readonly actionPrompt: string = 'Follow all previous instructions to develop an organic narrative response.\n' +

        'At the end of this response, generate a set of varied follow-up actions that {{user}} could choose to pursue.\n' +
        'Output these options in the following JSON schema:\n' +
        this.ACTION_JSON_SCHEMA + '\n';



        /*'At the very end of this response, output a dinkus (***), then generate and list approximately four brief options for varied follow-up actions that {{user}} could choose to pursue.\n' +
        'Options can be simple dialog or given actions or they can be risky actions with an associated stat; all options follow this format:\n' +
        '-(Stat +Modifier) Brief summary of action\n' +
        'These are all eight possible stats with a brief description and example verb associations:\n' +
        Object.keys(Stat).map(key => `${key}: ${StatDescription[key as Stat]}`).join('\n') +
        'The modifier is a relative difficulty adjustment between -5 and +5 which will be added to the skill check result; a lower number reflects a more difficult task.\n' +
        'Place each option on a separate line. Each stat may be used only once per response. Study the stat descriptions for inspiration and consider the characters\' current situations and assets. Here are sample options:\n' +
        '***\n' +
        '-Talk to the guard about admittance.\n' +
        '-(Charm -2) Convince the guard to let you in.\n' +
        '-(Might +1) Force the lock.\n' +
        '-(Skill -1) Pick the lock (it looks difficult).\n' +
        '-(Luck -1) Search for another way in.\n' +
        '-Give up.';*/

    // Regular expression to match the pattern "(Stat +modifier) description"
    readonly actionRegex = /(\w+)\s*([-+]\d+)\s*[-.:)]?\s*(.+)/;
    readonly whitespaceRegex = /^[\s\r\n]*$/;
    
    stats: {[key: string]: number} = {};
    currentMessage: string = '';
    actions: Action[] = [];
    currentMessageId: string|undefined = undefined;
    lastOutcome: Outcome|null = null;
    lastOutcomePrompt: string = '';
    promptForId: string|undefined = undefined;
    playerId: string;
    botId: string;
    experience: number = 0;

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
        console.log(userMessage);
        this.promptForId = promptForId ?? undefined;
        this.currentMessageId = identity;

        let errorMessage: string|null = null;
        let takenAction: Action|null = null;
        let finalContent: string|undefined = content;

        // Attempt to parse actions:
        for (let i = 0; i < this.actions.length; i++) {
            const action: Action = this.actions[i];
            if (action.stat && content.toLowerCase().includes(action.stat.toLowerCase())) {
                console.log('Chose action by stat');
                takenAction = action;
                break;
            } else if (content === `${i + 1}` || content === `${i + 1}.`) {
                console.log('Chose action by number');
                takenAction = action;
                break;
            } else if (content.length > 6 && action.description.toLowerCase().includes(content.toLowerCase())) {
                console.log('Chose action by description');
                takenAction = action;
                break;
            }
        }

        if (!takenAction && finalContent) {
            console.log('Ad-lib action.');
            let textGenRequest: TextGenRequest = {
                prompt: `${finalContent}\n[${this.adLibPrompt}]`,
                max_tokens: 100,
                min_tokens: 50,
                stop: [],
                include_history: false,
                template: '',
                context_length: 2000
            };
            let textResponse = await this.generator.textGen(textGenRequest);
            const adLibPattern = new RegExp(`^(${Object.values(Stat).join('|')}) ((\\+|-)\\d+)`);
            console.log('request complete?');
            console.log(textResponse);
            const match = adLibPattern.exec(textResponse?.result ?? '');

            if (match) {
                console.log('Found match');
                let action: Action = new Action(finalContent, match[1] as Stat, Number(match[2]));
                takenAction = action;
            } else {
                let action: Action = new Action(finalContent, null, 0);
                takenAction = action;
            }
        }

        if (takenAction) {
            this.setLastOutcome(takenAction.determineSuccess(takenAction.stat ? this.stats[takenAction.stat] : 0));
            finalContent = this.lastOutcome?.getDescription();

            if (this.lastOutcome?.result === Result.Failure) {
                this.experience++;
            }
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
        let parsingActions: boolean = false;
        this.actions = [];

        for (const line of lines) {
            const match = line.match(this.actionRegex);
            if (match) {
                if (!match[3].match(this.whitespaceRegex) && match[1] in Stat) {
                    console.log('Have an action: ' + match[3] + ';' + match[1] + ';' + match[2]);
                    this.actions.push(new Action(match[3], match[1] as Stat, Number(match[2])));
                }
                parsingActions = true;
            } else if (!parsingActions) {
                if (line.includes('***')) {
                    parsingActions = true;
                } else {
                    // If the line does not match the pattern, it's a content line
                    contentLines.push(line);
                }
            } else if(this.actions.length > 0 && line.match(this.whitespaceRegex)) {
                break;
            } else {
                console.log('Have a stat-less action: ' + line);
                this.actions.push(new Action(line, null, 0));
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
            systemMessage: this.actions.length > 0 ? `Choose an action:\n` + this.actions.map((action, index) => `${index + 1}. ${action.fullDescription()}`).join('\n') : null,
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
            this.experience = messageState['experience'] ?? 0
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
        messageState['experience'] = this.experience ?? 0;
        return messageState;
    }

    async chooseAction(action: Action) {
        console.log('taking an action: ' + this.promptForId + ":" + this.currentMessageId);
        this.messenger.updateEnvironment({
            input_enabled: false
        });
        this.setLastOutcome(action.determineSuccess(action.stat ? this.stats[action.stat] : 0));

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
