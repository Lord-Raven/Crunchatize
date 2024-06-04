import {Outcome} from "./Outcome";
import { Stage } from "./Stage";
import {Stat} from "./Stat";

export class Action {
    description: string;
    stat: Stat|null;
    modifier: number;

    constructor(description: string, stat: Stat|null, modifier: number) {
        this.description = description;
        this.stat = stat;
        this.modifier = modifier;
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

    fullDescription(): string {
        if (this.stat) {
            return `(${this.stat} ${this.modifier >= 0 ? ('+' + this.modifier) : (this.modifier < 0 ? this.modifier : '')}) ${this.description}`;
        } else {
            return `${this.description}`;
        }
    }

    render(stage: Stage) {
        return (
            <div>
                <button onClick={() => stage.chooseAction(this)}>
                    ({this.stat} {this.modifier >= 0 ? ('+' + this.modifier) : (this.modifier < 0 ? this.modifier : '')}) {this.description}
                </button>
            </div>
        );
    }
}