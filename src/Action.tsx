import {Outcome} from "./Outcome";
import { Stage } from "./Stage";
import {Stat} from "./Stat";

export class Action {
    description: string;
    stat: Stat|null;
    difficultyModifier: number;
    skillModifier: number;

    constructor(description: string, stat: Stat|null, difficultyModifier: number, skillModifier: number) {
        this.description = description;
        this.stat = stat;
        this.difficultyModifier = difficultyModifier;
        this.skillModifier = skillModifier;
    }

    // Method to simulate a dice roll
    diceRoll(): number {
        return Math.floor(Math.random() * 6) + 1;
    }

    // Method to determine success, partial success, or failure
    determineSuccess(): Outcome {
        const dieResult1: number = this.diceRoll();
        const dieResult2: number = this.diceRoll();
        return new Outcome(dieResult1, dieResult2, this);
    }

    fullDescription(): string {
        if (this.stat) {
            return `(${this.stat} ${this.difficultyModifier >= 0 ? ('+' + this.difficultyModifier) : (this.difficultyModifier < 0 ? this.difficultyModifier : '')}${this.skillModifier > 0 ? ` +${this.skillModifier}` : ''}) ${this.description}`;
        } else {
            return `${this.description}`;
        }
    }

    render(stage: Stage) {
        return (
            <div>
                <button>
                    ({this.stat} {this.difficultyModifier >= 0 ? ('+' + this.difficultyModifier) : (this.difficultyModifier < 0 ? this.difficultyModifier : '')}${this.skillModifier > 0 ? ` +${this.skillModifier}` : ''}) {this.description}
                </button>
            </div>
        );
    }
}