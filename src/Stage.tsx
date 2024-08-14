import {ReactElement} from "react";
import {StageBase, StageResponse, InitialData, Message, Character, User} from "@chub-ai/stages-ts";
import {LoadResponse} from "@chub-ai/stages-ts/dist/types/load";
import {Action} from "./Action";
import {Stat} from "./Stat"
import {Outcome, Result, ResultDescription} from "./Outcome";
import {env, pipeline} from '@xenova/transformers';
import {Client} from "@gradio/client";

type MessageStateType = any;

type ConfigType = any;

type InitStateType = any;

type ChatStateType = any;

/*
  nvm use 21.7.1
  yarn install (if dependencies have changed)
  yarn dev --host --mode staging
*/

export class Stage extends StageBase<InitStateType, ChatStateType, MessageStateType, ConfigType> {
    
    readonly defaultStat: number = 0;
    readonly levelThresholds: number[] = [2, 5, 8, 12, 16, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];

    // message-level variables
    experience: number = 0;
    statUses: {[stat in Stat]: number} = this.clearStatMap();
    stats: {[stat in Stat]: number} = this.clearStatMap();
    lastOutcome: Outcome|null = null;
    lastOutcomePrompt: string = '';

    // other
    client: any;
    fallbackPipeline: any;
    fallbackMode: boolean;
    player: User;
    characters: {[key: string]: Character};

    constructor(data: InitialData<InitStateType, ChatStateType, MessageStateType, ConfigType>) {
        super(data);
        const {
            characters,
            users,
            messageState,
        } = data;
        this.setStateFromMessageState(messageState);
        this.player = users[Object.keys(users)[0]];
        this.characters = characters;

        this.fallbackMode = false;
        this.fallbackPipeline = null;
        env.allowRemoteModels = false;
    }

    clearStatMap() {
        return {
            [Stat.Might]: 0,
            [Stat.Grace]: 0,
            [Stat.Skill]: 0,
            [Stat.Brains]: 0,
            [Stat.Wits]: 0,
            [Stat.Charm]: 0,
            [Stat.Heart]: 0,
            [Stat.Luck]: 0
        };
    }

    async load(): Promise<Partial<LoadResponse<InitStateType, ChatStateType, MessageStateType>>> {

        try {
            this.fallbackPipeline = await pipeline("zero-shot-classification", "Xenova/mobilebert-uncased-mnli");
        } catch (exception: any) {
            console.error(`Error loading pipeline: ${exception}`);
        }

        this.client = await Client.connect("JHuhman/statosphere-backend", {hf_token: import.meta.env.VITE_HF_API_KEY});

        console.log('Finished loading stage.');

        return {
            success: true,
            error: null,
            initState: null,
            chatState: null,
        };
    }

    async setState(state: MessageStateType): Promise<void> {
        this.setStateFromMessageState(state);
    }

    async beforePrompt(userMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {
        const {
            content,
            promptForId
        } = userMessage;

        let errorMessage: string|null = null;
        let takenAction: Action|null = null;
        let finalContent: string|undefined = content;

        if (finalContent && this.fallbackPipeline != null) {
            const statMapping:{[key: string]: string} = {
                //'Might (strength, physique, endurance)': 'Might',
                //'Might (hit, lift, weather, throw, intimidate)': 'Might',
                'hitting, lifting, enduring, throwing, intimidating': 'Might',
                //'Grace (agility, reflexes, balance, speed)': 'Grace',
                //'Grace (jump, dodge, balance, dance, land)': 'Grace',
                'jumping, dodging, balancing, dancing, landing': 'Grace',
                //'Skill (handiness, deftness, slight)': 'Skill',
                //'Skill (craft, lock-pick, pickpocket, aim, repair)': 'Skill',
                'crafting, lock-picking, pickpocketing, aiming, repairing': 'Skill',
                //'Brains (memory, logic, strategy)': 'Brains',
                //'Brains (recall, memorize, solve, strategize)': 'Brains',
                'recalling, memorizing, solving, strategizing': 'Brains',
                //'Wits (awareness, sharpness, trickery, sass)': 'Wits',
                //'Wits (react, quip, notice, fool)': 'Wits',
                'reacting, quipping, spotting, fooling': 'Wits',
                //'Charm (persuasiveness, attractiveness, stage presence)': 'Charm',
                //'Charm (persuade, deceive, beckon, perform)': 'Charm',
                'persuading, deceiving, beckoning, performing': 'Charm',
                //'Heart (resistance, resilience, empathy)': 'Heart',
                //'Heart (resist, recover, empathize, comfort)': 'Heart',
                'resisting, recovering, empathizing, comforting': 'Heart',
                //'Luck (riskiness, hope, fortune)': 'Luck',
                //'Luck (gamble, hope, discover)': 'Luck',
                'gambling, hoping, discovering': 'Luck',
                //'Sloth (passivity, idleness, small-talk)': 'None'};
                //'Sloth (chat, rest, wait, stand by)': 'None'};
                'chatting, resting, waiting, standing by': 'None'};
            let topStat: Stat|null = null;
            const statHypothesis = 'This passage involves {}, or related activities.'
            let statResponse = await this.query({sequence: content, candidate_labels: Object.keys(statMapping), hypothesis_template: statHypothesis, multi_label: true });
            console.log(`Stat selected: ${(statResponse.scores[0] > 0.4 ? statMapping[statResponse.labels[0]] : 'None')}`);
            if (statResponse && statResponse.labels && statResponse.scores[0] > 0.4 && statMapping[statResponse.labels[0]] != 'None') {
                topStat = Stat[statMapping[statResponse.labels[0]] as keyof typeof Stat];
            }

            const difficultyMapping:{[key: string]: number} = {
                '1 (simple or straightforward)': 1000,
                '2 (somewhat involved or fiddly)': 1,
                '3 (moderately involved or complex)': 0,
                '4 (highly taxing or challenging)': -1,
                '5 (utterly arduous or formidable)': -2,
                '6 (absolutely impossible or insurmountable)': -3};
            let difficultyRating:number = 0;
            const difficultyHypothesis = 'The apparent difficulty of this activity on a scale of 1-6 is {}.';
            let difficultyResponse = await this.query({sequence: content, candidate_labels: Object.keys(difficultyMapping), hypothesis_template: difficultyHypothesis, multi_label: true });
            console.log(`Difficulty modifier selected: ${difficultyMapping[difficultyResponse.labels[0]]}`);
            if (difficultyResponse && difficultyResponse.labels[0]) {
                difficultyRating = difficultyMapping[difficultyResponse.labels[0]];
            }

            if (topStat && difficultyRating < 1000) {
                takenAction = new Action(finalContent, topStat, difficultyRating, this.stats[topStat]);
            } else {
                takenAction = new Action(finalContent, null, 0, 0);
            }
        }

        if (takenAction) {
            this.setLastOutcome(takenAction.determineSuccess());
            finalContent = this.lastOutcome?.getDescription();

            if (takenAction.stat) {
                this.statUses[takenAction.stat]++;
            }

            if (this.lastOutcome?.result === Result.Failure) {
                this.experience++;
                let level = this.getLevel();
                if (this.experience == this.levelThresholds[level]) {
                    const maxCount = Math.max(...Object.values(this.statUses));
                    const maxStats = Object.keys(this.statUses)
                            .filter((stat) => this.statUses[stat as Stat] === maxCount)
                            .map((stat) => stat as Stat);
                    let chosenStat = maxStats[Math.floor(Math.random() * maxStats.length)];
                    this.stats[chosenStat]++;

                    finalContent += `\n##Welcome to level ${level + 2}!##\n#_${chosenStat}_ up!#`;

                    this.statUses = this.clearStatMap();
                } else {
                    finalContent += `\n###You've learned from this experience...###`
                }
            }
        }

        return {
            stageDirections: `\n[INST]${this.replaceTags(this.lastOutcomePrompt,{
                "user": this.player.name,
                "char": promptForId ? this.characters[promptForId].name : ''
            })}\n[/INST]`,
            messageState: this.buildMessageState(),
            modifiedMessage: finalContent,
            systemMessage: null,
            error: errorMessage,
            chatState: null,
        };
    }

    getLevel(): number {
        return Object.values(this.stats).reduce((acc, val) => acc + val, 0)
    }
    async afterResponse(botMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {

        this.lastOutcomePrompt = '';

        return {
            stageDirections: null,
            messageState: this.buildMessageState(),
            modifiedMessage: null,
            error: null,
            systemMessage: `---\n` +
                `\`{{user}} - Level ${this.getLevel() + 1} (${this.experience}/${this.levelThresholds[this.getLevel()]})\`<br>` +
                `\`${Object.keys(Stat).map(key => `${key}: ${this.stats[key as Stat]}`).join(' | ')}\``,
            chatState: null
        };
    }

    setStateFromMessageState(messageState: MessageStateType) {
        this.stats = this.clearStatMap();
        if (messageState != null) {
            for (let stat in Stat) {
                this.stats[stat as Stat] = messageState[stat] ?? this.defaultStat;
                this.statUses[stat as Stat] = messageState[`use_${stat}`] ?? 0;
            }
            this.lastOutcome = messageState['lastOutcome'] ? this.convertOutcome(messageState['lastOutcome']) : null;
            this.lastOutcomePrompt = messageState['lastOutcomePrompt'] ?? '';
            this.experience = messageState['experience'] ?? 0;
        }
    }

    convertOutcome(input: any): Outcome {
        return new Outcome(input['dieResult1'], input['dieResult2'], this.convertAction(input['action']));
    }

    convertAction(input: any): Action {
        return new Action(input['description'], input['stat'] as Stat, input['difficultyModifier'], input['skillModifier'])
    }

    buildMessageState(): any {
        let messageState: {[key: string]: any} = {};
        for (let stat in Stat) {
            messageState[stat] = this.stats[stat as Stat] ?? this.defaultStat;
            messageState[`use_${stat}`] = this.statUses[stat as Stat] ?? 0;
        }
        messageState['lastOutcome'] = this.lastOutcome ?? null;
        messageState['lastOutcomePrompt'] = this.lastOutcomePrompt ?? '';
        messageState['experience'] = this.experience ?? 0;

        return messageState;
    }

    setLastOutcome(outcome: Outcome|null) {
        this.lastOutcome = outcome;
        this.lastOutcomePrompt = '';
        if (this.lastOutcome) {
            this.lastOutcomePrompt += `{{user}} has chosen the following action: ${this.lastOutcome.action.description}\n`;
            this.lastOutcomePrompt += `${ResultDescription[this.lastOutcome.result]}\n`
        }
    }

    replaceTags(source: string, replacements: {[name: string]: string}) {
        return source.replace(/{{([A-z]*)}}/g, (match) => {
            return replacements[match.substring(2, match.length - 2)];
        });
    }

    async query(data: any) {
        console.log(data);
        let result: any = null;
        if (this.client && !this.fallbackMode) {
            try {
                const response = await this.client.predict("/predict", {data_string: JSON.stringify(data)});
                result = JSON.parse(`${response.data[0]}`);
            } catch(e) {
                console.log(e);
            }
        }
        if (!result) {
            console.log('Falling back to local zero-shot pipeline.');
            this.fallbackMode = true;
            result = await this.fallbackPipeline(data.sequence, data.candidate_labels, { hypothesis_template: data.hypothesis_template, multi_label: data.multi_label });
        }
        console.log(result);
        return result;
    }

    render(): ReactElement {
        return <div style={{
            width: '100vw',
            height: '100vh',
            display: 'grid',
            alignItems: 'stretch'
        }}>
        </div>;
    }

}
