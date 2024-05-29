import {Outcome} from "./Outcome";
import { Stage } from "./Stage";
import {Stat} from "./Stat";

export class Action {
    description: string;
    stat: Stat;
    modifier: number;
    stage: Stage;

    constructor(description: string, stat: Stat, modifier: number, stage: Stage) {
        this.description = description;
        this.stat = stat;
        this.modifier = modifier;
        this.stage = stage;
    }

    // Method to simulate a dice roll
    diceRoll(): number {
        return Math.floor(Math.random() * 6) + 1;
    }

    // Method to determine success, partial success, or failure
    determineSuccess(skillScore: number): Outcome {
        const dieResult1: number = this.diceRoll();
        const dieResult2: number = this.diceRoll();
        return new Outcome(dieResult1, dieResult2, this);
    }

    render() {
        return (
            <div>
                <button onClick={() => this.stage.chooseAction(this)}>
                    ({this.stat} {this.modifier > 0 ? ('+' + this.modifier) : (this.modifier < 0 ? this.modifier : '')}) {this.description}
                </button>
            </div>
        );
    }
}