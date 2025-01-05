import React, { useState, useEffect, useRef } from "react"; // Import React and React hooks
import { Chessboard } from "react-chessboard"; // Import the Chessboard component
import { Chess } from "chess.js"; // Import the Chess library for game logic

import { Timer } from "./Timer.js"
import { MoveHistory, ChessMove, StructuredMove, MovesAnalysis } from "./MoveHistory.js";
import { AVAILABLE_BOTS, parseStockfishMessage, ChessPositionMoves, BotStrategy, ChessPositionMove } from "./ChessBot.js"

import './App.css';

const APPNAME = "Junior Chess"
const INTERVAL_MS = 123

// FIXME: out of bounds after starting from here: localhost:3000/junior_chess?botSymbol=🐉&fen=2k5/8/8/8/8/8/3Q4/4K3 w - - 0 22

// Use latest state combined with intervals
// from: https://overreacted.io/making-setinterval-declarative-with-react-hooks/
function useInterval(callback, delay) {
  const savedCallback = useRef();

  // Remember the latest callback.
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the interval.
  useEffect(() => {
    function tick() {
      savedCallback.current();
    }
    if (delay !== null) {
      let id = setInterval(tick, delay);
      return () => clearInterval(id);
    }
  }, [delay]);
}

// define supported versions of stockfish
const stockfishVersions = ["stockfish-16.1-lite-single.js"];

class GameMoves {
  /* Memorize numbers of moves to play */
  constructor(numMoves = null) {
    this.currentMove = 0;
    this.initialValue = numMoves;
    this.reset()
  }

  reset() {
    if (this.initialValue === null) return;
    this.currentMove = this.initialValue;
  }

  decrement() {
    if (this.initialValue === null) return;
    this.currentMove -= 1;
  }

  expired() {
    if (this.initialValue === null) return false;
    return this.currentMove <= 0;
  }

  value() {
    if (this.initialValue === null) return null;
    return this.currentMove;
  }
}

function getBotFromSymbol(symbol, defaultIndex = null) {
  for (const bot of AVAILABLE_BOTS) {
    if (bot.botSymbol === symbol) {
      return bot
    }
  }
  if (defaultIndex !== null) {
    return AVAILABLE_BOTS[defaultIndex]
  }
  return null
}

function negateStockfishScore(value) {
  if(typeof value == "string") {
    if (value.startsWith("-")) {
      return value.substring(1)
    }
    if(value.startsWith("Mate in")) {
      return "To be mated in " + value.substring(8)
    }
  } else {
    return -value
  }
}

const App = () => {

  const queryParameters = new URLSearchParams(window.location.search)
  const urlFen = queryParameters.get("fen")
  const urlBotSymbol = queryParameters.get("botSymbol")
  const urlBotColor = queryParameters.get("botColor") === "white" ? "white" : "black"
  const urlPreMoves = queryParameters.get("preMoves")

  // State variables for chess game logic, Stockfish worker, best move, and evaluation
  const [gameState, setgameState] = useState("loading");  // loading, playing, gameOver -- to indicate state
  const [game, setGame] = useState(new Chess()); // Chess game instance
  const [startingFen, setStartingFen] = useState(""); // FEN with which we started the game
  const [stockfish, setStockfish] = useState(null); // Stockfish Web Worker instance
  const [analysisStockfish, setAnalysisStockfish] = useState(null); // Stockfish Web Worker instance for analysis
  const [bestMove, setBestMove] = useState(""); // Best move suggested by Stockfish
  const [evaluation, setEvaluation] = useState(""); // Evaluation of the position by Stockfish
  const [bestMoveArrow, setBestMoveArrow] = useState([]); // Stores arrow based on best move
  const arrowColor = "rgba(0, 0, 255, 0.6)"; // Custom arrow color

  // State variables for tracking the last move's from and to squares
  const [fromSquare, setFromSquare] = useState(null); // Holds the starting square of the last move
  const [toSquare, setToSquare] = useState(null); // Holds the destination square of the last move

  const [computerMoves, setComputerMoves] = useState(urlBotColor); // Which color should the computer move (white, black, none)

  // set defaults
  const [stockfishModel, setStockfishModel] = useState(stockfishVersions[0])
  const [showBestMove, setShowBestMove] = useState(false)
  const [showEvaluation, setShowEvaluation] = useState(false)

  const [whiteTimeMS, setWhiteTimeMS] = useState(15 * 60 * 1000)
  const [whiteIncrementMS, setWhiteIncrementMS] = useState(10 * 1000)
  const [blackTimeMS, setBlackTimeMS] = useState(15 * 60 * 1000)
  const [blackIncrementMS, setBlackIncrementMS] = useState(10 * 1000)

  const whiteTimerRef = useRef(null);
  if (whiteTimerRef.current === null) whiteTimerRef.current = new Timer(whiteTimeMS);
  const blackTimerRef = useRef(null);
  if (blackTimerRef.current === null) blackTimerRef.current = new Timer(blackTimeMS);

  const [whiteTimerString, setWhiteTimerString] = useState(whiteTimerRef.current.getRemainingTime())
  const [blackTimerString, setBlackTimerString] = useState(blackTimerRef.current.getRemainingTime())

  const [historyString, setHistoryString] = useState("")
  const moveHistoryRef = useRef(null);
  if (moveHistoryRef.current === null) moveHistoryRef.current = new MoveHistory();

  const chessPositoinMoves = useRef(null);
  if (chessPositoinMoves.current === null) chessPositoinMoves.current = new ChessPositionMoves();
  const [botStrategy, setBotStrategy] = useState(getBotFromSymbol(urlBotSymbol, 0));

  const gameMoves = useRef(null)
  if (gameMoves.current === null) gameMoves.current = new GameMoves(null);
  const [movesToPlay, setMovesToPlay] = useState(gameMoves.current.value())

  const analysisRef = useRef(null);
  const [analysisMoveIndex, setAnalysisMoveIndex] = useState(0)
  const [analysisCurrentMove, setAnalysisCurrentMove] = useState([])

  const gamePreMoves = useRef(null);
  if (gamePreMoves.current === null) gamePreMoves.current = [];

  // TODO: implement analysis mode with showing best N moves, turned into link with FEN game and how to continue
  // TODO: make short cut game mode settings (color, depth, fav figure, move to select)

  // check for game update regularly
  const interval = useInterval(() => {
    updateGameState()
  }, INTERVAL_MS);

  // useEffect hook to initialize the Stockfish Web Worker
  useEffect(() => {
    // stockfish-16.1-lite-single.js
    const stockfishWorker = new Worker(`${process.env.PUBLIC_URL}/js/${stockfishModel}`);
    setStockfish(stockfishWorker);

    const analysisStockfishWorker = new Worker(`${process.env.PUBLIC_URL}/js/${stockfishModel}`);
    setAnalysisStockfish(analysisStockfishWorker)

    // Terminate the worker when the component unmounts
    return () => {
      stockfishWorker.terminate();
      analysisStockfishWorker.terminate();
      clearInterval(interval); // This represents the unmount function, in which you need to clear your interval to prevent memory leaks.
    };
  }, []);

  const reset_game = (startFen = "") => {
    updateStateBaseOnGame(startFen === "" ? new Chess() : new Chess(startFen)); // Reset the game state
    setBestMove(""); // Clear the best move
    setEvaluation(""); // Clear the evaluation
    setBestMoveArrow([]); // Clear the best move arrow
    setFromSquare(null); setToSquare(null); // Clear last moves
    setgameState("playing");
    setHistoryString("")

    whiteTimerRef.current.reset(whiteTimeMS)
    blackTimerRef.current.reset(blackTimeMS)

    moveHistoryRef.current = new MoveHistory(startFen)
    setAnalysisMoveIndex(0)
    analysisRef.current = null
    gameMoves.current.reset()
    setMovesToPlay(gameMoves.current.value())

    initializeGame() // set values from new state
  };

  const startGame = (startFen = "", maxMoves = 0, preMoves = "") => {
    if (computerMoves === "random") {
      setComputerMoves(Math.random() < 0.5 ? "white" : "black")
    }
    console.debug("Setting moves to play based on parameter: ", maxMoves)
    if (maxMoves !== "" && maxMoves !== 0) {
      gameMoves.current = new GameMoves(Math.floor(maxMoves))
    } else {
      gameMoves.current = new GameMoves(null)
    }
    setMovesToPlay(gameMoves.current.value())

    setgameState("playing");
    setStartingFen(startFen)
    if (preMoves !== "") {
      // remove newlines from preMoves string, then split by spaces and turn into moves array
      preMoves = preMoves.replace(/\n/g, " ");
      let moves = preMoves.split(" ")
      console.debug("Received pre moves: ", moves)
      checkAndSetPreMoves(startFen, moves)
    }
    reset_game(startFen);
  };

  const checkAndSetPreMoves = (startFen, moves) => {
    console.debug("Checking ", moves.length, " with FEN: ", startFen)
    let checkGame = startFen !== "" ? new Chess(startFen) : new Chess()
    let preMoves = []
    console.debug("Assessing ", moves.length, " preMoves")
    for (let i = 0; i < moves.length; i++) {
      let nextMove = moves[i]
      let sourceSquare = nextMove.slice(0, 2)
      let targetSquare = nextMove.slice(2, 4)
      let promotionPiece = nextMove.slice(4, 5)

      const structuredMove = new StructuredMove(
        sourceSquare,
        targetSquare,
        promotionPiece,
        checkGame.fen()
      )

      console.debug("Validating ", structuredMove.str(), " ...")
      const move = checkGame.move(structuredMove.chessMove());

      // If the move is invalid, return false to prevent it
      if (move === null) {
        console.debug("Invalid move ", structuredMove.str(), ", stopping premoves.")
        break
      }
      preMoves.push(nextMove)
    }
    console.debug("Setting ", preMoves.length, " pre moves")
    gamePreMoves.current = preMoves
  }

  const initializeGame = () => {
    console.debug("Initializing game ...");
    // Initialize the game with a specific FEN string
    getMoveFromStockfish(game)
  };


  const toggleComputerMoves = () => {

    if (gameState === "playing") {
      if (computerMoves === "black") {
        setComputerMoves("none")
      } else if (computerMoves === "white") {
        setComputerMoves("black")
      } else {
        setComputerMoves("white")
      }
    } else {
      if (computerMoves === "black") {
        setComputerMoves("random")
      } else if (computerMoves === "white") {
        setComputerMoves("black")
      } else if (computerMoves === "none") {
        setComputerMoves("white")
      } else {
        setComputerMoves("none")
      }
    }

    updateGameState()
  }

  const updateGameState = () => {
    if (gameState === "playing") {


      if (whiteTimerRef.current.hasTimedOut()) {
        console.debug("White timer timed out")
        setgameState("gameOver")
      }
      if (blackTimerRef.current.hasTimedOut()) {
        console.debug("Black timer timed out")
        setgameState("gameOver")
      }

      setBlackTimerString(blackTimerRef.current.getTimeString())
      setWhiteTimerString(whiteTimerRef.current.getTimeString())
    } else {
      whiteTimerRef.current.stop()
      blackTimerRef.current.stop()
    }

    if (gameState === "prepare_analyzing" && analysisRef.current !== null) {
      if (analysisRef.current.ready()) {
        console.debug("Done analysis, starting analysis state.")
        setgameState("analyzing")
        setAnalysisMoveArrow()
      }
    }


    let historyHtmlString = '<ol type="1">'
    let currentMove = ""
    /* Create string that lists all moves in moveHistoryRef.current.getMoves() */
    moveHistoryRef.current.getMoves().forEach((move) => {
      /* add 2 moves into a row, make it an html enumerated list */
      if (currentMove === "") {
        currentMove = move
      } else {
        historyHtmlString += '<li>' + currentMove.move.str() + " " + move.move.str() + '</li>'
        currentMove = ""
      }
    })
    if (currentMove !== "") {
      historyHtmlString += '<li>' + currentMove.move.str() + '</li>'
    }
    historyHtmlString += '</ol>'
    setHistoryString(historyHtmlString)

    if (gamePreMoves.current.length > 0) {
      // wait until the engine has a best move
      if (!bestMove) return
      // FIXME tries to repeat the same move multiple times, as game state is not updated everywhere in time

      console.debug("Select premove for game move number ", game.moveNumber(), " from: ", gamePreMoves.current)
      let nextMove = gamePreMoves.current[0]
      gamePreMoves.current.shift()
      console.debug("Next move: ", nextMove)
      // use premove, mark as computer move
      let promoPiece = nextMove.length > 4 ? nextMove.slice(4,5) : null
      movePiece(nextMove.slice(0, 2), nextMove.slice(2, 4), false, promoPiece, true)
    } else if ((computerMoves === "white" && game.turn() === "w") || (computerMoves === "black" && game.turn() === "b")) {
      // update the game logic, i.e. make a bot move, write message, ...
      console.debug("Computer moves ", computerMoves, " with turn color ", game.turn());
      if (bestMove) {
        movePiece(bestMove.slice(0, 2), bestMove.slice(2, 4), true);
      } else {
        console.debug("No move available yet");
      }
    }

    /* TODO: check new game state for being a draw! */
  }

  const getMoveFromStockfish = (game) => {
    // Ask stockfish to evaluate the given game, and set values for bestMove, bestMove Arrow and evaluation

    if (!stockfish) return false;

    chessPositoinMoves.current = new ChessPositionMoves(game.fen())
    console.debug("Posting stockfish messages with new game state and gameState: ", gameState)
    stockfish.postMessage(`position fen ${game.fen()}`); // Set the position in Stockfish
    stockfish.postMessage(`setoption name multipv value 3`); // have stockfish send 3 potential moves
    stockfish.postMessage("go depth " + botStrategy.depth); // Ask Stockfish to analyze to depth 15

    // Listen for messages from Stockfish and update best move and evaluation
    stockfish.onmessage = (event) => {
      const { bestMove: stockfishMove, evaluation: evaluation, pawnsScore: score, move: move } = parseStockfishMessage(
        event.data,
        game.turn()
      );

      if (stockfishMove && stockfishMove !== "(none)") {  // final message from stockfish
        console.debug("Stockfish best move: ", stockfishMove)
        let structuredBotMove = botStrategy.selectMoveFromChessPositionMoves(
          chessPositoinMoves.current, stockfishMove,
          game.turn() === "w" ? whiteTimerRef.current.getRemainingTime() : blackTimerRef.current.getRemainingTime()
        )
        console.debug("Received bot move: ", structuredBotMove)
        setBestMove(structuredBotMove ? structuredBotMove.str() : stockfishMove); // Update the best move
        setBestMoveArrow([[structuredBotMove.sourceSquare, structuredBotMove.targetSquare]]); // Set arrow for best move

        if (game.turn() === "w" && computerMoves === "white") { // remove time taken from bot from player time
          whiteTimerRef.current.reduce(structuredBotMove.timeTakenMS)
        } else if (game.turn() === "b" && computerMoves === "black") {
          blackTimerRef.current.reduce(structuredBotMove.timeTakenMS)
        }
      } else {
        let positionMove = new ChessPositionMove(
          move, score, event.data)
        chessPositoinMoves.current.addMove(positionMove)
      }
      if (evaluation) setEvaluation(evaluation); // Update the evaluation score
    };

    return true;
  }

  const updateStateBaseOnGame = (newGame) => {
    console.debug("Update game with new FEN: ", newGame.fen())
    setGame(newGame);

    if (newGame.isDraw()) {
      setgameState("draw")
    } else {
      if (newGame.isGameOver()) {
        setgameState("gameOver");
      }
    }

    if (gameMoves.current.expired() && gameState === "playing") {
      setgameState("allmoved")
    }
  }

  const movePiece = (sourceSquare, targetSquare, computer = false, promotion = null, preMove = false) => {

    // Do not move in case we are not playing
    if (gameState !== "playing") return false;

    // Attempt to move piece from source to target
    // Check whether we are allowed to move right now, human and computer
    if (!preMove) {
      if (computer) {
        if ((computerMoves !== "white" && game.turn() === "w") || (computerMoves !== "black" && game.turn() === "b")) {
          return false
        }
      } else {
        if ((computerMoves === "white" && game.turn() === "w") || (computerMoves === "black" && game.turn() === "b")) {
          console.debug("Human moves, but it is not their turn")
          return false
        }
      }
    }

    const gameCopy = new Chess(game.fen()); // Clone the current game state

    try {
      const structuredMove = new StructuredMove(
        sourceSquare,
        targetSquare,
        promotion !== null ? promotion :(computer ? "q" : "q"), // FIXME: consume promotion properly. For now, always promote to a queen for simplicity
        game.fen()
      )
      const move = gameCopy.move(structuredMove.chessMove());

      // If the move is invalid, return false to prevent it
      if (move === null) {
        return false;
      }

      if(game.turn() === "w") {
        gameMoves.current.decrement()
        setMovesToPlay(gameMoves.current.value())
      }

      // only switch timers in case of a valid move
      if (game.turn() === "w") {
        console.debug("Stopping white timer with remainint time " + whiteTimerRef.current.getTimeString())
        whiteTimerRef.current.stop()
        blackTimerRef.current.continue(blackIncrementMS)
      } else {
        console.debug("Stopping black timer with remainint time " + blackTimerRef.current.getTimeString())
        blackTimerRef.current.stop()
        whiteTimerRef.current.continue(whiteIncrementMS)
      }

      console.debug("Update board with move " + sourceSquare + " -> " + targetSquare + " done by computer:" + computer)
      moveHistoryRef.current.addMove(
        new ChessMove(game, structuredMove, whiteTimerRef.current.getRemainingTime(), blackTimerRef.current.getRemainingTime())
      )

      // Store state from before the game
      updateStateBaseOnGame(gameCopy); // Update the game state with the new move
      setBestMove(""); // Clear the best move
      setBestMoveArrow([]); // Clear the best move arrow
      setFromSquare(sourceSquare); // Update the starting square of the last move
      setToSquare(targetSquare); // Update the destination square of the last move

      // Send the updated position to Stockfish for analysis
      if (stockfish) {
        getMoveFromStockfish(gameCopy)
      }

      return true; // Return true if the move was valid
    } catch (error) {
      console.error(error.message); // Log error if an invalid move
      return false;
    }
  };

  const setSelectedBotFromValue = (symbolValue) => {
    let selectedBot = getBotFromSymbol(symbolValue)
    if (selectedBot === null) {
      console.error("Could not find bot with symbol " + symbolValue)
      return
    }
    setBotStrategy(selectedBot)
  }


  // Function to handle piece drop events on the chessboard
  const onDrop = (sourceSquare, targetSquare) => {
    console.debug("Reeived onDrop with " + sourceSquare + " to " + targetSquare)
    // wait for engine to compute score and best move
    if (bestMove === "") return false;

    // do not allow human moves as long as there are moves to be played from the input
    if ( gamePreMoves.current.length > 0 )
      return false;

    return movePiece(sourceSquare, targetSquare, false)
  }

  const getSquareStyles = () => {
    /* draw colors for best analysis move */
    const styles = {}; // Initialize an empty object for square styles
    if (fromSquare) {
      styles[fromSquare] = { backgroundColor: "rgba(173, 216, 230, 0.8)" }; // Light blue for the from-square
    }
    if (toSquare) {
      styles[toSquare] = { backgroundColor: "rgba(144, 238, 144, 0.8)" }; // Light green for the to-square
    }
    return styles; // Return the styles object
  }

  const getAnalysisSquareStyles = () => {
    const styles = {}; // Initialize an empty object for square styles

    if (analysisRef.current === null ) {
      return
    }

    let bestMove = analysisRef.current.analyzedMoves[analysisMoveIndex].bestMove

    if (bestMove.sourceSquare) {
      styles[bestMove.sourceSquare] = { backgroundColor: "rgba(173, 216, 230, 0.8)" }; // Light blue for the from-square
    }
    if (bestMove.targetSquare) {
      styles[bestMove.targetSquare] = { backgroundColor: "rgba(144, 238, 144, 0.8)" }; // Light green for the to-square
    }
    return styles; // Return the styles object
  };

  const setAnalysisMoveArrow = (index = null) => {
    let moveIndex = index !== null ? index : analysisMoveIndex
    let move = analysisRef.current.moveHistory.getMoves()[moveIndex].move
    console.debug("Setting analysis move arrow to " + move.sourceSquare + " -> " + move.targetSquare)
    setAnalysisCurrentMove([[move.sourceSquare,move.targetSquare]])
  }

  /* start game analysis */
  const analyzeGame = () => {
    analysisRef.current = new MovesAnalysis(moveHistoryRef.current, analysisStockfish)
    analysisRef.current.analyze()

    if (analysisRef.current.ready()) {
      setgameState("analyzing")
    }
  };

  const changeAnalysisIndex = (change) => {
    let newIndex = analysisMoveIndex + change
    setAnalysisIndexValue(newIndex)
  }

  const setAnalysisIndexValue = (newIndex) => {
    let knownMoves = analysisRef.current.moveHistory.moves.length
    newIndex = newIndex >= knownMoves ? knownMoves -1 : newIndex;
    newIndex = newIndex < 0 ? 0 : newIndex
    setAnalysisMoveIndex(newIndex)
    setAnalysisMoveArrow(newIndex)
  }

  if (gameState === "loading") return (
    <div style={{ "padding": "5 vmin", "textAlign": "left", "backgroundColor": "#dddddd", "margin": "0 auto", }}>
      <h1>{APPNAME} Game</h1>
      <h2>Setup</h2>
      <b>Computer</b>{botStrategy.botSymbol} moves <b>{computerMoves} pieces.</b>
      <b>White</b> time {whiteTimeMS / 60000} + {whiteIncrementMS / 1000} and black time {blackTimeMS / 60000} + {blackIncrementMS / 1000}.
      <h2>Modify Game</h2>
      <button style={{ "padding": "2px", "margin": "2px" }} onClick={() => startGame(document.getElementById("fen").value, document.getElementById("move_numbers").value, document.getElementById("pre_moves").value)}>▶ Start</button>
      <button style={{ "padding": "2px", "margin": "2px" }} onClick={() => toggleComputerMoves()}>⟳ Change Computer</button>
      <div>
        <p>
          <label>
            Select Bot:
            <select
              value={botStrategy.botSymbol}
              onChange={(e) => setSelectedBotFromValue(e.target.value)}
            >
              {Object.entries(AVAILABLE_BOTS).map(([index, item]) => (
                <option key={item.botSymbol} value={item.botSymbol}>
                  {item.botSymbol + " " + item.botName}
                </option>
              ))}
            </select>
          </label>
        </p>
        <p>
          Maximal Moves: <input type="number" min="0" id="move_numbers" name="max_moves" placeholder="number of moves" /><button style={{ "padding": "2px", "margin": "2px" }} onClick={() => document.getElementById("move_numbers").value = ""}>Unlimited</button>
        </p>
      </div>
      <details><summary><strong>Start from Position</strong></summary>
        <button onClick={() => document.getElementById("fen").value = ""}>Plain Game</button>
        <h4>End Games</h4>
        <p>
          <button onClick={() => document.getElementById("fen").value = "2k5/8/8/8/8/8/3Q4/4K3 w - - 0 22"}>Queen♕</button>
          <button onClick={() => document.getElementById("fen").value = "2k5/8/8/8/8/8/3R4/4K3 w - - 0 22"}>Rook♖</button>
          <button onClick={() => document.getElementById("fen").value = "2k5/8/8/8/8/8/3P4/4K3 w - - 0 22"}>Pawn♙</button>
          <button onClick={() => document.getElementById("fen").value = "2k5/8/8/8/8/8/3NB3/4K3 w - - 0 22"}>Bishop♗ + Knight♘</button>
          <button onClick={() => document.getElementById("fen").value = "2k5/8/8/8/8/8/3BB3/4K3 w - - 0 22"}>Bishop♗ + Bishop♗</button>
          <button onClick={() => document.getElementById("fen").value = "2k5/1r6/8/8/8/8/3Q4/4K3 w - - 0 22"}>Queen♕ vs Rook♖</button>
          <button onClick={() => document.getElementById("fen").value = "2k5/3r4/8/8/8/8/3PR3/4K3 w - - 0 22"}>Rook♖+Pawn♙ vs Rook♖</button>
        </p>
        <h4>Full FEN</h4>
        <p>
          <input type="text" id="fen" name="fen" placeholder="FEN string" value={urlFen} />
        </p>
      </details>
      <details><summary><strong>Time Settings</strong></summary>

        <div>
          <p>
            White Time:
            <button onClick={() => { setWhiteTimeMS(15 * 60 * 1000); setWhiteIncrementMS(10 * 1000); }}>15 + 10</button>
            <button onClick={() => { setWhiteTimeMS(5 * 60 * 1000); setWhiteIncrementMS(0 * 1000); }}>5 + 0</button>
            <button onClick={() => { setWhiteTimeMS(3 * 60 * 1000); setWhiteIncrementMS(1 * 1000); }}>3 + 1</button>
          </p>
        </div>

        <div>
          <p>
            Black Time:
            <button onClick={() => { setBlackTimeMS(15 * 60 * 1000); setBlackIncrementMS(10 * 1000); }}>15 + 10</button>
            <button onClick={() => { setBlackTimeMS(5 * 60 * 1000); setBlackIncrementMS(0 * 1000); }}>5 + 0</button>
            <button onClick={() => { setBlackTimeMS(3 * 60 * 1000); setBlackIncrementMS(1 * 1000); }}>3 + 1</button>
          </p>
        </div>

      </details>
      <details><summary><strong>Game UI Settings</strong></summary>
        <label>
          <input
            type="checkbox"
            checked={showBestMove}
            onChange={(e) => setShowBestMove(e.target.checked)}
          />
          Show Best Move
        </label>
        <label>
          <input
            type="checkbox"
            checked={showEvaluation}
            onChange={(e) => setShowEvaluation(e.target.checked)}
          />
          Show Evaluation
        </label>
      </details>
      <details><summary><strong>Pre-Moves</strong></summary>
      <p>List of moves to be executed (fromSquareToSquare), space separated:</p>
      <textarea type="text"
       id="pre_moves"
       name="pre_moves"
       placeholder="e2e4 e7e5"
       value={urlPreMoves}
       rows="6"
       style={{height: "6em"}}></textarea>
      </details>
      <details><summary><strong>Stockfish Settings</strong></summary>
        <div>
          <label>
            Stockfish Model:
            <select
              value={stockfishModel}
              onChange={(e) => setStockfishModel(e.target.value)}
            >
              <option value="stockfish-16.1-lite-single.js">Stockfish 16.1 Lite</option>
              { /* other options --
              <option value="stockfish-16.1-single.js">Stockfish 16.1 Full</option>
              <option value="stockfish-15.js">Stockfish 15</option>
              */
              }
            </select>
          </label>
        </div>
      </details>

    </div>)
  else if (gameState === "prepare_analyzing") {
    return (
    <div style={{ "padding": "5 vmin", "textAlign": "left", "backgroundColor": "#eeeeee", "margin": "0 auto", }}>
    <h1>Junior Chess -- Preparing Analysis</h1>
    <p>Preparing analysis for {moveHistoryRef.current.moves.length} moves</p>
    <p>Analysis will be ready soon ... 🦁🦄🐉🐴🪰</p>
    <button style={{ "padding": "2px", "margin": "2px" }} onClick={() => {reset_game(); setgameState("loading")}}>New Game</button>
    </div>
    )
  }
  else if (gameState === "analyzing") {
    return (
    <div style={{ "padding": "5 vmin", "textAlign": "left", "backgroundColor": "#eeeeee", "margin": "0 auto", }}>
    <h1>Junior Chess -- Analysis</h1>
    <p>Analysis for {analysisRef.current.moveHistory.moves.length} moves</p>
    <Chessboard
            position={analysisRef.current.moveHistory.getMoves()[analysisMoveIndex].move.preFen} // Current position from the game state
            boardWidth={Math.min(500, document.documentElement.clientWidth * 0.8)} // Width of the chessboard in pixels
            customSquareStyles={getAnalysisSquareStyles()} // highlight best move
            customArrows={analysisCurrentMove} // draw arrow for current move
          />
    <p>
    <button onClick={() => {changeAnalysisIndex(-10)}}>-10</button>
    <button onClick={() => {changeAnalysisIndex(-1)}}>Prev Move</button>
    <button onClick={() => {changeAnalysisIndex(1)}}>Next Move</button>
    <button onClick={() => {changeAnalysisIndex(10)}}>+10</button>
    </p>
    <p>
    <button style={{ "padding": "2px", "margin": "2px" }} onClick={() => {reset_game(); setgameState("loading")}}>New Game</button>
    </p>
    <p>
    Move: {analysisMoveIndex}
    Score: {analysisRef.current.moveHistory.getMoves()[analysisMoveIndex].move.prePositionScore}
    </p>
    <p>
    Best Move: {analysisRef.current.analyzedMoves[analysisMoveIndex].bestMove.str()}
    Best Score: {analysisRef.current.analyzedMoves[analysisMoveIndex].bestMoveScore}
    </p>
    <h2>Full history</h2>
    <table>
    <thead>
      <tr>
        <th></th>
        <th>Move</th>
        <th>Turn</th>
        <th>Score</th>
        <th>Best Move</th>
        <th>Best Score</th>
        <th>Best Move Order</th>
      </tr>
    </thead>
    <tbody>
      {analysisRef.current.analyzedMoves.map((analyzedMove, index) => (
          <tr key={index}
            onClick={() => {setAnalysisIndexValue(index)}}
            style={{
              backgroundColor: index === analysisMoveIndex ? '#ffeb3b' : 'transparent',
              cursor: 'pointer'
            }}
          >
          <td>{index}</td>
          <td>{analyzedMove.structuredMove.move.preFen.split(" ")[1]}</td>
          <td>{analyzedMove.structuredMove.move.str()}</td>
          <td>{analyzedMove.score}</td>
          <td>{analyzedMove.bestMove.str()}</td>
          <td>{analyzedMove.bestMoveScore}</td>
          <td>{analyzedMove.bestMoveParts.join(' ')}</td>
        </tr>
      ))}
    </tbody>
    </table>
    <button style={{ "padding": "2px", "margin": "2px" }} onClick={() => {reset_game(); setgameState("loading")}}>New Game</button>
    </div>
    )
  }
  else return (
    <div style={{ "padding": "5 vmin", "textAlign": "left", "backgroundColor": "#eeeeee", "margin": "0 auto", }}>
      <h1>{APPNAME} Game</h1>
      <section>
        <div id="board_tag">
          <p>Black Time: {blackTimerString}
          {
            showEvaluation && <b> with score: {negateStockfishScore(evaluation)} </b>
          }
          {computerMoves === "black" && <b>Moving by bot {botStrategy.botSymbol} {botStrategy.botName}</b>}
          </p>
          {/* Chessboard component with custom pieces, square styles, and custom arrow */}
          <Chessboard
            position={game.fen()} // Current position from the game state
            onPieceDrop={onDrop} // Function to handle piece drops // TODO: how to handle selected promotion piece?!
            boardWidth={Math.min(500, document.documentElement.clientWidth * 0.8)} // Width of the chessboard in pixels
            // customPieces={customPieces} // Custom pieces mapping
            // customLightSquareStyle={lightSquareStyle} // Apply custom light square style
            // customDarkSquareStyle={darkSquareStyle} // Apply custom dark square style
            customSquareStyles={getSquareStyles()} // Apply last move highlight styles
            customArrows={showBestMove ? bestMoveArrow : undefined} // Draws the best move arrow on the board
            customArrowColor={showBestMove ? arrowColor : undefined} // Set the custom arrow color
          />
          <p>White Time: {whiteTimerString}
          {
            showEvaluation && <b> with score: {evaluation} </b>
          }
          { computerMoves === "white" && <b>Moving by bot {botStrategy.botSymbol} {botStrategy.botName}</b>}
          </p>
        </div>
        {
          movesToPlay !== null && <p>Remaining Moves: {movesToPlay}</p>
        }
      </section>
      {/* Display the best move and evaluation score */}
      {/* Display gameover*/
        gameState === "gameOver" && <h3>Game Over: {game.turn() === "b" ? "White" : "Black"} wins!</h3>
      }
      {/* Display gameover*/
        gameState === "draw" && <h3>Game Over: draw!</h3>
      }
      {
        gameState === "allmoved" && <h3>Game Over: run all moves!</h3>
      }
      <div>
        {
          (showBestMove || showEvaluation) && <h3>Best Move</h3>
        }
        {
          showBestMove && <p>Best Move: {bestMove}</p>
        }
        {
          showEvaluation && <p>Position Score for White: {evaluation}</p>
        }
        <h3>Game Settings</h3>
        <button style={{ "padding": "2px", "margin": "2px" }} onClick={() => reset_game(startingFen)}>Reset Game</button>
        <button style={{ "padding": "2px", "margin": "2px" }} onClick={() => toggleComputerMoves()}>Computer moves: {computerMoves}</button>
        <button style={{ "padding": "2px", "margin": "2px" }} onClick={() => {reset_game(); setgameState("loading")}}>New Game</button>
        <button style={{ "padding": "2px", "margin": "2px" }} onClick={() => {setgameState("prepare_analyzing"); analyzeGame(); }}>Abort+Analyze</button>
        <details><summary>State and History</summary>

          <p><b>Move Number: {game.moveNumber()}</b></p>
          <p>
            FEN: {game.fen()}<button onClick={() => navigator.clipboard.writeText(game.fen())}>Copy FEN to clipboard</button>
          </p>
          {/* show moves from game array as enumerated list
          game.history(true).map(
            item => <p>{item}</p>
          )
           */
          }
          { /* use the game.history({ verbose = false } = {}) method to print all moves that have happened until now
          game.history({ verbose: true }).map(
            item => <p>{item.from} -> {item.to}</p>
          )
          */
          }
          <div className="history" dangerouslySetInnerHTML={{ __html: historyString }}></div>
        </details>

      </div>
    </div>
  );
};

export default App; // Export the App component as the default export
