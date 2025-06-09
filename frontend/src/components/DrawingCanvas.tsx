import React, { useRef, useState, useEffect } from 'react';
import { Stage, Layer, Line as KonvaLine, Circle } from 'react-konva';
import Konva from 'konva';

// This should align with the stroke data structure used across the app
export interface StrokeData {
  id: string; // Unique ID for the stroke
  points: number[]; // Flat array of points [x1, y1, x2, y2, ...]
  color: string;
  width: number;
  tool: 'pen' | 'eraser'; // Added tool property
  clientId?: string; // Optional: if you need to know who drew it
}

export interface DrawingCanvasProps {
  width: number;
  height: number;
  strokes: StrokeData[];
  onDrawEnd: (newStroke: Omit<StrokeData, 'id' | 'clientId'>) => void; 
  isDrawingEnabled: boolean;
  currentTool: 'pen' | 'eraser'; // Added currentTool prop
  selectedColor: string; // NEW: Color for the pen
  selectedBrushSize: number; // NEW: Size for pen and eraser
  // If you have onDrawStart and onDrawMove, their signatures might need tool info too
  // onDrawStart?: (point: { x: number; y: number }) => void;
  // onDrawMove?: (point: { x: number; y: number }) => void;
}

const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  // Add a bit of spacing for readability
  width,
  height,
  strokes,
  onDrawEnd,
  isDrawingEnabled,
  currentTool,
  selectedColor,      // No default, passed from GamePage
  selectedBrushSize,  // No default, passed from GamePage
}) => {
  const [isPainting, setIsPainting] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<number[]>([]);
  const stageRef = useRef<Konva.Stage>(null);
  const [cursorPreviewVisible, setCursorPreviewVisible] = useState<boolean>(false);
  const [cursorPreviewPosition, setCursorPreviewPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isDrawingEnabled) return;
    setIsPainting(true);
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    setCurrentPoints([pos.x, pos.y]);
    // onDrawStart?.({ x: pos.x, y: pos.y }); // If using this prop
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;

    // Always update cursor preview position when mouse is over the stage
    if (isDrawingEnabled) { // Only show preview if drawing is generally possible
        setCursorPreviewPosition({ x: pos.x, y: pos.y });
    }

    if (!isPainting || !isDrawingEnabled) return;
    setCurrentPoints(prevPoints => [...prevPoints, pos.x, pos.y]);
    // onDrawMove?.({ x: pos.x, y: pos.y }); // If using this prop
  };

  const handleMouseUp = () => {
    if (!isPainting || !isDrawingEnabled) return;
    setIsPainting(false);

    let pointsToDraw = [...currentPoints];

    // If it's a click without drag (only start point recorded)
    // Duplicate the point to make it a zero-length line, which renders as a dot
    // due to strokeWidth and lineCap: 'round' (which is default for Konva.Line or should be set).
    if (pointsToDraw.length === 2) { 
      pointsToDraw.push(pointsToDraw[0], pointsToDraw[1]);
    }

    if (pointsToDraw.length >= 4) { // A line needs at least two (x,y) pairs
      const newStroke: StrokeData = {
        id: Date.now().toString(), // Simple unique ID
        points: pointsToDraw,
        tool: currentTool,
        color: currentTool === 'eraser' ? '#ffffff' : selectedColor,
        width: selectedBrushSize,
      };
      onDrawEnd(newStroke);
    }
    setCurrentPoints([]);
  };

  return (
    <Stage
      width={width}
      height={height}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseEnter={() => {
        if (isDrawingEnabled) setCursorPreviewVisible(true);
      }}
      onMouseLeave={() => {
        setCursorPreviewVisible(false);
        handleMouseUp(); // Existing call to stop drawing
      }}
      ref={stageRef}
      style={{ border: '1px solid #ccc', touchAction: 'none' }}
    >
      <Layer>
        {/* Render completed strokes from prop */} 
        {strokes.map((stroke) => (
          <KonvaLine
            key={stroke.id}
            points={stroke.points}
            stroke={stroke.tool === 'eraser' ? '#ffffff' : stroke.color} 
            strokeWidth={stroke.width}
            tension={0.5} // tension might make single dots less dot-like if points are identical, but fine for actual lines
            lineCap="round" // Crucial for dot rendering
            lineJoin="round"
            globalCompositeOperation={
              stroke.tool === 'eraser' ? 'destination-out' : 'source-over'
            }
          />
        ))}
        {/* Render the current line being drawn */} 
        {isPainting && currentPoints.length > 0 && (
          <KonvaLine
            points={currentPoints}
            stroke={currentTool === 'eraser' ? '#ffffff' : selectedColor}
            strokeWidth={selectedBrushSize}
            tension={0.5}
            lineCap="round" // Crucial for dot rendering
            lineJoin="round"
            globalCompositeOperation={
              currentTool === 'eraser' ? 'destination-out' : 'source-over'
            }
          />
        )}
        {/* Cursor Preview Circle */}
        {cursorPreviewVisible && isDrawingEnabled && (
          <Circle
            x={cursorPreviewPosition.x}
            y={cursorPreviewPosition.y}
            radius={selectedBrushSize / 2}
            fill={currentTool === 'pen' ? selectedColor : 'rgba(150, 150, 150, 0.3)'} // Semi-transparent grey for eraser
            stroke={currentTool === 'eraser' ? 'rgba(100, 100, 100, 0.8)' : undefined}
            strokeWidth={currentTool === 'eraser' ? 1 : undefined}
            listening={false} // Important: Preview should not capture mouse events
          />
        )}
      </Layer>
    </Stage>
  );
};

export default DrawingCanvas;
