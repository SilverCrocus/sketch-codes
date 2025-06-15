import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SketchPicker, ColorResult } from 'react-color';
import {
  PREDEFINED_COLORS,
  BRUSH_SIZES,
  MIN_BRUSH_SIZE,
  MAX_BRUSH_SIZE,
} from '../constants/drawing';

interface DrawingToolbarProps {
  currentTool: 'pen' | 'eraser';
  onSetCurrentTool: (tool: 'pen' | 'eraser') => void;
  selectedColor: string;
  onSetSelectedColor: (color: string) => void;
  selectedBrushSize: number;
  onSetSelectedBrushSize: (size: number) => void;
  onClearCanvas: () => void;
  isDrawingEnabled: boolean;
  drawingPhaseActive: boolean;
  drawingSubmitted: boolean;
}

const DrawingToolbar: React.FC<DrawingToolbarProps> = ({
  currentTool,
  onSetCurrentTool,
  selectedColor,
  onSetSelectedColor,
  selectedBrushSize,
  onSetSelectedBrushSize,
  drawingPhaseActive,
  drawingSubmitted,
}) => {
  const [displayColorPicker, setDisplayColorPicker] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  const isDisabled = !drawingPhaseActive || drawingSubmitted;

  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) {
      setDisplayColorPicker(false);
    }
  }, []);

  useEffect(() => {
    if (displayColorPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [displayColorPicker, handleClickOutside]);

  const handleColorChange = (color: ColorResult) => {
    onSetSelectedColor(color.hex);
  };

  return (
    <div className="flex-1 flex flex-col items-center space-y-1 mx-2">
      <div className="flex items-center space-x-3">
        {/* Tool Selector */}
        <div className="flex items-center space-x-1">
          <button
            onClick={() => onSetCurrentTool('pen')}
            className={`px-2 py-1 text-xs rounded shadow border hover:border-gray-500 ${currentTool === 'pen' ? 'bg-blue-500 text-white border-blue-700' : 'bg-white text-gray-700 border-gray-400'}`}
            disabled={isDisabled}
            title="Pen Tool"
          >
            Pen
          </button>
          <button
            onClick={() => onSetCurrentTool('eraser')}
            className={`px-2 py-1 text-xs rounded shadow border hover:border-gray-500 ${currentTool === 'eraser' ? 'bg-blue-500 text-white border-blue-700' : 'bg-white text-gray-700 border-gray-400'}`}
            disabled={isDisabled}
            title="Eraser Tool"
          >
            Eraser
          </button>
        </div>

        {/* Predefined Colors */}
        <div className="flex items-center space-x-1">
          {PREDEFINED_COLORS.map((color) => (
            <button
              key={color.value}
              onClick={() => onSetSelectedColor(color.value)}
              className={`w-5 h-5 rounded-full shadow border-2 hover:opacity-80 ${selectedColor === color.value ? 'border-gray-800 ring-2 ring-offset-1 ring-gray-700' : 'border-gray-300'}`}
              style={{ backgroundColor: color.value }}
              title={color.name}
              disabled={isDisabled}
            />
          ))}
        </div>

        {/* Custom Color Picker Button */}
        <div className="relative">
          <button
            onClick={() => {
              if (!isDisabled) setDisplayColorPicker(!displayColorPicker);
            }}
            className="p-0.5 bg-white rounded shadow border border-gray-400 hover:border-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Select custom color"
            disabled={isDisabled}
          >
            <div className="w-4 h-4 rounded-sm" style={{ backgroundColor: selectedColor }}></div>
          </button>
          {displayColorPicker && (
            <div
              ref={colorPickerRef}
              className="absolute z-50 top-full mt-1 left-1/2 transform -translate-x-1/2"
            >
              <SketchPicker color={selectedColor} onChangeComplete={handleColorChange} />
            </div>
          )}
        </div>
      </div>

      {/* Brush Size Selector */}
      <div className="flex items-center space-x-2 w-full max-w-xs">
        <span className="text-xs text-gray-600">Size:</span>
        {BRUSH_SIZES.map((size) => (
          <button
            key={size.value}
            onClick={() => onSetSelectedBrushSize(size.value)}
            className={`w-5 h-5 rounded-full shadow border-2 hover:opacity-80 flex items-center justify-center ${selectedBrushSize === size.value ? 'bg-gray-400 border-gray-800 ring-2 ring-offset-1 ring-gray-700' : 'bg-gray-200 border-gray-300'}`}
            title={`${size.name} (${size.value}px)`}
            disabled={isDisabled}
          >
            <div
              className="rounded-full bg-black"
              style={{
                width: `${Math.max(2, size.value / 2)}px`,
                height: `${Math.max(2, size.value / 2)}px`,
              }}
            ></div>
          </button>
        ))}
        <input
          type="range"
          min={MIN_BRUSH_SIZE}
          max={MAX_BRUSH_SIZE}
          value={selectedBrushSize}
          onChange={(e) => onSetSelectedBrushSize(Number(e.target.value))}
          className="flex-grow h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isDisabled}
          title={`Brush size: ${selectedBrushSize}px`}
        />
        <span className="text-xs text-gray-600 w-6 text-right">{selectedBrushSize}</span>
      </div>
    </div>
  );
};

export default DrawingToolbar;
