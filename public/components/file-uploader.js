(function() {
  'use strict';

  const DEFAULT_ACCEPT = ['.txt', '.json'];

  function toArray(list) {
    return Array.prototype.slice.call(list || []);
  }

  function validateFile(file, config) {
    const maxSize = config?.maxSize || (window.APP_CONFIG && window.APP_CONFIG.MAX_FILE_SIZE) || Infinity;
    const accept = config?.accept || DEFAULT_ACCEPT;

    if (file.size > maxSize) {
      throw new Error(`File "${file.name}" exceeds the maximum size of ${(maxSize / (1024 * 1024)).toFixed(1)}MB.`);
    }

    const lowerName = file.name.toLowerCase();
    const typeValid = accept.some(ext => lowerName.endsWith(ext));

    if (!typeValid) {
      throw new Error(`Unsupported file type for "${file.name}". Allowed: ${accept.join(', ')}`);
    }
  }

  function initializeFileUploader(options) {
    const dropzone = options.dropzone;
    const fileInput = options.fileInput;
    const onFiles = options.onFiles;
    const errorTarget = options.errorTarget;
    const config = options.config || {};

    if (!dropzone || !fileInput || typeof onFiles !== 'function') {
      return { destroy() {} };
    }

    const preventDefaults = event => {
      event.preventDefault();
      event.stopPropagation();
    };

    const dragEvents = ['dragenter', 'dragover', 'dragleave', 'drop'];
    dragEvents.forEach(eventName => {
      dropzone.addEventListener(eventName, preventDefaults, false);
      document.body.addEventListener(eventName, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, () => {
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, () => {
        dropzone.classList.remove('dragover');
      });
    });

    const handleFileSelection = files => {
      const fileArray = toArray(files);

      try {
        fileArray.forEach(file => validateFile(file, config));
        onFiles(fileArray);
      } catch (error) {
        if (window.EdgeComponents && window.EdgeComponents.showError && errorTarget) {
          window.EdgeComponents.showError(errorTarget, error.message);
        } else {
          alert(error.message);
        }
      }
    };

    dropzone.addEventListener('drop', event => {
      handleFileSelection(event.dataTransfer.files);
    });

    dropzone.addEventListener('click', event => {
      if (!event.target.closest('button')) {
        fileInput.click();
      }
    });

    fileInput.addEventListener('change', event => {
      handleFileSelection(event.target.files);
      fileInput.value = '';
    });

    if (options.selectButton) {
      options.selectButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        fileInput.click();
      });
    }

    return {
      destroy() {
        dragEvents.forEach(eventName => {
          dropzone.removeEventListener(eventName, preventDefaults, false);
          document.body.removeEventListener(eventName, preventDefaults, false);
        });
      }
    };
  }

  window.EdgeComponents = window.EdgeComponents || {};
  window.EdgeComponents.initializeFileUploader = initializeFileUploader;
})();
