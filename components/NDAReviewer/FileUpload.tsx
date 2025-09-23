import React, { useCallback, useState } from 'react';

interface FileUploadProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
  error?: string | null;
  maxSizeMb?: number;
}

const ACCEPTED_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ACCEPTED_EXTENSION = '.docx';

export const FileUpload: React.FC<FileUploadProps> = ({
  onFileSelected,
  disabled = false,
  error = null,
  maxSizeMb = 5,
}) => {
  const [localError, setLocalError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');

  const validateFile = useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith(ACCEPTED_EXTENSION)) {
        throw new Error('Only .docx files are supported.');
      }

      if (file.type && file.type !== ACCEPTED_MIME) {
        throw new Error('Uploaded file must be a .docx Word document.');
      }

      const maxBytes = maxSizeMb * 1024 * 1024;
      if (file.size > maxBytes) {
        throw new Error(`File exceeds the ${maxSizeMb}MB size limit.`);
      }
    },
    [maxSizeMb],
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || !files.length) {
        return;
      }

      const file = files[0];

      try {
        validateFile(file);
        setLocalError(null);
        setFileName(file.name);
        onFileSelected(file);
      } catch (validationError) {
        const message = validationError instanceof Error ? validationError.message : 'Invalid file upload.';
        setLocalError(message);
      }
    },
    [onFileSelected, validateFile],
  );

  const onInputChange = useCallback<React.ChangeEventHandler<HTMLInputElement>>(
    (event) => {
      handleFiles(event.target.files);
    },
    [handleFiles],
  );

  const onDrop = useCallback<React.DragEventHandler<HTMLDivElement>>(
    (event) => {
      event.preventDefault();
      if (disabled) {
        return;
      }
      handleFiles(event.dataTransfer.files);
    },
    [disabled, handleFiles],
  );

  const onDragOver = useCallback<React.DragEventHandler<HTMLDivElement>>((event) => {
    event.preventDefault();
  }, []);

  return (
    <div className="nda-file-upload">
      <label className="nda-file-upload__label">Upload NDA (.docx only)</label>
      <div
        className={`nda-file-upload__dropzone${disabled ? ' nda-file-upload__dropzone--disabled' : ''}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
      >
        <input
          id="nda-file-input"
          type="file"
          accept={ACCEPTED_EXTENSION}
          disabled={disabled}
          onChange={onInputChange}
          className="nda-file-upload__input"
        />
        <p className="nda-file-upload__message">
          Drag and drop a Word document here, or click to select a file.
        </p>
        {fileName && <p className="nda-file-upload__filename">Selected: {fileName}</p>}
      </div>
      {(localError || error) && <p className="nda-file-upload__error">{localError ?? error}</p>}
    </div>
  );
};

export default FileUpload;
