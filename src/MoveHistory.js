import { Chess } from "chess.js"; // Import the Chess library for game logic


export class StructuredMove {

  constructor(sourceSquare, targetSquare, promotion, preFen = "", timeTakenMS = 0) {
    this.sourceSquare = sourceSquare; // square where to take figure from
    this.targetSquare = targetSquare; // suqare where to put figure
    this.promotion = promotion;  // piece selected for promotion
    this.timeTakenMS = timeTakenMS; // time taken to decide this move
    this.preFen = preFen; // game position before this move
    this.prePositionScore = null; // score of the position before this move
  }

  chessMove() {
    return {
      from: this.sourceSquare,
      to: this.targetSquare,
      promotion: this.promotion, // Always promote to a queen for simplicity
    }
  }

  str() {
    return `${this.sourceSquare}${this.targetSquare}`
  }
}

export class ChessMove {
  /* Class storing a single move. */
  constructor(game, move, whiteMS, blackMS) {
    this.game = game; /* of type chess */
    this.move = move; /* of type StructuredMove */
    this.whiteTimeMS = whiteMS;
    this.blackTimeMS = blackMS;
  }
}

export class MoveHistory {
  /* Class storing all moves, where each move comes with a pre-move FEN and a post-move FEN as well as the actual move. */
  constructor(startFEN = null) {
    this.startFEN = startFEN;
    this.moves = []; /* of type ChessMove */
  }

  addMove(move) {
    this.moves.push(move);
  }

  moveCount() {
    return this.moves.length;
  }

  getMoves() {
    return this.moves;
  }
}

export class AnalyzedMoves {
  constructor(structuredMove, bestStructuredMove, bestScore) {
    this.structuredMove = structuredMove;
    this.bestMove = bestStructuredMove;
    this.bestMoveScore = bestScore;
  }
}


export class MovesAnalysis {
  constructor(moveHistory, stockfishWorker) {
    this.moveHistory = moveHistory; /* of type MoveHistory */
    this.stockfishWorker = stockfishWorker; 
    this.state = "preparing";

    this.analyzedMoves = []; /* of type AnalyzedMoves */
    this.currentIndex = 0;
    this.currentScore = null;
  }

  ready() {
    // Fixed: Added return statement to properly check state
    return this.state === "ready";
  }

  /* async function that get stockfish evaluation and best suggested move for each position in the move history, from the perspective of white. when done, set the state to ready */
  analyze() {
    // TODO: implement
    console.debug("starting analysis of ", this.moveHistory.getMoves().length, " moves");


    // Output all moves to debug console
    this.moveHistory.getMoves().forEach((move, index) => {
      console.debug(`Move ${index + 1}: ${move.move.str()}`);
    });

    // kick off background analysis
    this.stockfishWorker.onmessage = (event) => {
      this.processEngineMessage(event);
    };
    this.startAnalyzingCurrenMove()
    return
  }

  /* process event from stockfish with current object state */
  processEngineMessage(event) {
    // https://github.com/bjedrzejewski/stockfish-js/blob/master/example/enginegame.js
    let finishedCurrentEvaluation = false;
    console.debug("Received analysis worker event: ", event)
    let line = event.data;
    let bestMove = null;

    /* match events */
    let match = line.match(/^bestmove ([a-h][1-8])([a-h][1-8])([qrbk])?/);
    console.debug("Analysis stockfish event match: ", match)
    if(match) {
      finishedCurrentEvaluation = true;
        // from, to, promotion
        console.debug("Found analysis best move for index ", this.currentIndex, " : ", match[1], match[2], match[3]);
        bestMove = new StructuredMove(match[1], match[2], match[3]);
    }
    const game = this.moveHistory.getMoves()[this.currentIndex].game;
    match = line.match(/^info .*\bscore (\w+) (-?\d+)/)
    if(match) {
        var score = parseInt(match[2]) * (game.turn() === 'w' ? 1 : -1);
        if(match[1] === 'cp') {
            this.currentScore = (score / 100.0).toFixed(2);
        } else if(match[1] === 'mate') {
          this.currentScore = '#' + score;
        }
        match = line.match(/\b(upper|lower)bound\b/)
        if(match) {
          this.currentScore = ((match[1] === 'upper') === (game.turn() === 'w') ? '<= ' : '>= ') + score
        }
    }

    if (finishedCurrentEvaluation) {
      this.analyzedMoves.push(
        new AnalyzedMoves(
          this.moveHistory.getMoves()[this.currentIndex],
          bestMove,
          this.currentScore
        )
      );
      
      console.debug("analysis of move ", this.currentIndex + 1, " finished with score ", this.currentScore, ". AnalyzedMoves now has ", this.analyzedMoves.length, " moves");
      this.currentIndex++;
      this.currentScore = null;

      if (this.currentIndex >= this.moveHistory.getMoves().length) {
        this.state = "ready";
        console.debug("analysis of ", this.moveHistory.getMoves().length, " moves finished");
        console.debug(this.analyzedMoves)
      } else {
        this.startAnalyzingCurrenMove();
      }
    }
  }

  startAnalyzingCurrenMove() {
    let fen = this.moveHistory.getMoves()[this.currentIndex].move.preFen;
    console.debug("Start analyzing move ", this.currentIndex + 1, " of ", this.moveHistory.getMoves().length, " with FEN: ", fen);
    this.stockfishWorker.postMessage("position fen " + fen);
    this.stockfishWorker.postMessage("go depth 10"); // TODO: set to 20
  }
}