let pdfDoc = null;
let currentPage = 1;
let currentScale = 0.9; // Set initial scale to 90%
const SCALE_STEP = 0.1;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3.0;
let lastExplanation = '';

document.addEventListener('DOMContentLoaded', async function() {
    const uploadButton = document.getElementById('uploadButton');
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');
    const pdfViewer = document.getElementById('pdfViewer');
    const pdfViewerContainer = document.getElementById('pdfViewerContainer');
    const questionInput = document.getElementById('questionInput');
    const sendButton = document.getElementById('sendButton');
    const chatMessages = document.getElementById('chatMessages');
    const suggestionPills = document.getElementById('suggestionPills');
    const zoomInButton = document.getElementById('zoomIn');
    const zoomOutButton = document.getElementById('zoomOut');
    const zoomLevelDisplay = document.getElementById('zoomLevel');
    const prevPageButton = document.getElementById('prevPage');
    const nextPageButton = document.getElementById('nextPage');
    const currentPageSpan = document.getElementById('currentPage');
    const pageCountSpan = document.getElementById('pageCount');
    const testComprehensionButton = document.getElementById('testComprehension');

    // Upload button click handler
    uploadButton.addEventListener('click', () => {
        fileInput.click();
    });

    // File input change handler
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file && file.type === 'application/pdf') {
            await loadPDF(file);
        }
    });

    // Drag and drop handlers
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'application/pdf') {
            await loadPDF(file);
        }
    });

    // Send button click handler
    sendButton.addEventListener('click', () => handleQuestion());

    // Enter key handler for textarea
    questionInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleQuestion();
        }
    });

    // Zoom button click handlers
    zoomInButton.addEventListener('click', () => {
        if (currentScale < MAX_SCALE) {
            currentScale = Math.min(currentScale + SCALE_STEP, MAX_SCALE);
            renderPage(currentPage);
            updateZoomLevel();
        }
    });

    zoomOutButton.addEventListener('click', () => {
        if (currentScale > MIN_SCALE) {
            currentScale = Math.max(currentScale - SCALE_STEP, MIN_SCALE);
            renderPage(currentPage);
            updateZoomLevel();
        }
    });

    // Page navigation button click handlers
    prevPageButton.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderPage(currentPage);
            updatePageControls();
        }
    });

    nextPageButton.addEventListener('click', () => {
        if (currentPage < pdfDoc.numPages) {
            currentPage++;
            renderPage(currentPage);
            updatePageControls();
        }
    });

    // Add test comprehension button handler
    testComprehensionButton.addEventListener('click', function() {
        handleQuestion('Generate a comprehension question about the paper to test my understanding.', true);
    });
});

async function handleQuestion(question = null, isComprehension = false) {
    const input = question || document.getElementById('questionInput').value;
    if (!input.trim()) return;

    // Clear input if it's from the text box
    if (!question) {
        document.getElementById('questionInput').value = '';
    }

    // Add user message if not a comprehension request
    if (!isComprehension) {
        addMessage(input, 'user');
    }
    
    try {
        const context = await getVisibleContent();
        
        // Show loading state
        const loadingMessage = addMessage('<div class="loading">Analyzing paper and searching for relevant information...</div>', 'assistant');
        
        console.log('Sending request with:', {
            question: input,
            context: context,
            is_comprehension: isComprehension
        });

        const response = await fetch('/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                question: input,
                context: context,
                is_comprehension: isComprehension
            }),
        });

        const data = await response.json();
        console.log('Received response:', data);
        
        // Remove loading message
        if (loadingMessage && loadingMessage.parentNode) {
            loadingMessage.remove();
        }

        if (data.error) {
            throw new Error(data.error);
        }
        
        // Add the response to the chat
        addMessage(data, 'assistant');
    } catch (error) {
        console.error('Error in handleQuestion:', error);
        addMessage(`Sorry, I encountered an error while processing your request: ${error.message}`, 'assistant');
    }
}

function addMessage(content, role) {
    const messagesContainer = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    if (typeof content === 'string') {
        messageDiv.innerHTML = content;
    } else {
        // Handle Perplexity API response format
        const responseHtml = `
            <div class="response-content">
                <div class="main-answer">${content.answer}</div>
                ${content.citations && content.citations.length > 0 ? `
                    <div class="citations">
                        <h4>Citations</h4>
                        <ul>
                            ${content.citations.map(citation => `
                                <li>
                                    <a href="${citation}" target="_blank" rel="noopener noreferrer">
                                        ${new URL(citation).hostname}
                                    </a>
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                ` : ''}
                ${content.usage ? `
                    <div class="usage-stats">
                        <span>Tokens used: ${content.usage.total_tokens}</span>
                    </div>
                ` : ''}
            </div>
        `;
        messageDiv.innerHTML = responseHtml;
    }
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return messageDiv;
}

function addLoadingMessage() {
    const id = 'loading-' + Date.now();
    const loadingContent = `
        <div class="loading-dots">
            <span></span>
            <span></span>
            <span></span>
        </div>
        Thinking...
    `;
    addMessage(loadingContent, 'loading', id);
    return id;
}

function removeLoadingMessage(id) {
    const loadingMessage = document.getElementById(id);
    if (loadingMessage) {
        loadingMessage.remove();
    }
}

function updateSuggestionPills(followUpQuestions) {
    const suggestionPills = document.getElementById('suggestionPills');
    suggestionPills.innerHTML = '';

    // Add follow-up question pills
    followUpQuestions.forEach(question => {
        const pill = document.createElement('button');
        pill.className = 'pill-button';
        pill.textContent = question;
        pill.addEventListener('click', () => handleQuestion(question));
        suggestionPills.appendChild(pill);
    });

    // Add comprehension test pill
    const comprehensionPill = document.createElement('button');
    comprehensionPill.className = 'pill-button comprehension';
    comprehensionPill.textContent = 'Test my comprehension';
    comprehensionPill.addEventListener('click', () => handleQuestion(null, true));
    suggestionPills.appendChild(comprehensionPill);
}

function displayQuiz(quiz) {
    const quizContainer = document.createElement('div');
    quizContainer.className = 'quiz-container';
    
    const questionText = document.createElement('div');
    questionText.textContent = quiz.question;
    quizContainer.appendChild(questionText);

    const options = quiz.options.map((option, index) => {
        const optionElement = document.createElement('div');
        optionElement.className = 'quiz-option';
        optionElement.textContent = option;
        optionElement.dataset.index = index;
        optionElement.addEventListener('click', () => handleQuizAnswer(optionElement, index === quiz.correctAnswer, quiz.explanation));
        return optionElement;
    });

    options.forEach(option => quizContainer.appendChild(option));
    addMessage(quizContainer.outerHTML, 'ai', true);
}

function handleQuizAnswer(selectedOption, isCorrect, explanation) {
    // Disable all options
    const options = document.querySelectorAll('.quiz-option');
    options.forEach(option => {
        option.style.pointerEvents = 'none';
        if (option === selectedOption) {
            option.classList.add(isCorrect ? 'correct' : 'incorrect');
        } else if (parseInt(option.dataset.index) === quiz.correctAnswer) {
            option.classList.add('correct');
        }
    });

    // Add feedback
    const feedback = document.createElement('div');
    feedback.className = 'quiz-feedback';
    feedback.textContent = isCorrect ? 
        'Correct! ' + explanation :
        'Incorrect. ' + explanation;
    
    selectedOption.parentElement.appendChild(feedback);
}

function checkAnswer(selectedIndex, correctAnswer) {
    const isCorrect = selectedIndex === parseInt(correctAnswer);
    const feedback = isCorrect ? 
        'Correct! Well done! ' : 
        'Not quite right. Try again or ask for an explanation. ';
    
    addMessage(feedback, 'assistant');
}

async function loadPDF(file) {
    const fileArrayBuffer = await file.arrayBuffer();
    pdfDoc = await pdfjsLib.getDocument({ data: fileArrayBuffer }).promise;
    
    currentPage = 1;
    currentScale = 0.9;
    renderPage(currentPage);
    updatePageControls();
    updateZoomLevel();
    
    document.getElementById('dropZone').style.display = 'none';
    document.getElementById('pdfViewer').style.display = 'block';
    
    // Get initial context
    const context = await getVisibleContent();
    
    // Add initial message with comfort level selector
    const messageContent = `
        <div class="initial-greeting">
            <p>I've loaded your PDF! Before we begin, please select your comfort level with the topic:</p>
            <div class="comfort-selector">
                <div class="comfort-options">
                    ${[1,2,3,4,5].map(level => `
                        <button class="comfort-option" data-level="${level}">
                            ${level}
                            <span class="comfort-tooltip">
                                ${level === 1 ? 'Complete beginner' : 
                                  level === 2 ? 'Basic understanding' :
                                  level === 3 ? 'Intermediate knowledge' :
                                  level === 4 ? 'Advanced understanding' :
                                  'Expert level'}
                            </span>
                        </button>
                    `).join('')}
                </div>
                <div class="comfort-description">
                    <p>1: Complete beginner - Explain everything in simple terms</p>
                    <p>2: Basic understanding - Use some technical terms with explanations</p>
                    <p>3: Intermediate knowledge - Balance technical and simple explanations</p>
                    <p>4: Advanced understanding - Use technical terminology freely</p>
                    <p>5: Expert level - Use advanced terminology and complex concepts</p>
                </div>
            </div>
        </div>
    `;
    
    addMessage(messageContent, 'assistant');
    
    // Add click handlers for comfort level selection
    document.querySelectorAll('.comfort-option').forEach(button => {
        button.addEventListener('click', async (e) => {
            const level = parseInt(e.target.dataset.level);
            // Store the user's comfort level
            const response = await fetch('/set_comfort_level', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ comfort_level: level })
            });
            
            // Update UI to show selected level
            document.querySelectorAll('.comfort-option').forEach(btn => {
                btn.classList.remove('selected');
                if (parseInt(btn.dataset.level) === level) {
                    btn.classList.add('selected');
                }
            });
            
            // Add confirmation message
            addMessage(`Thanks! I'll adjust my explanations to match your comfort level (${level}/5). Feel free to ask any questions about the paper!`, 'assistant');
        });
    });
}

async function renderPage(num) {
    const page = await pdfDoc.getPage(num);
    
    // Calculate viewport size to fit the container width while maintaining aspect ratio
    const container = document.getElementById('pdfViewerContainer');
    
    // Scroll to top when changing pages
    container.scrollTo(0, 0);
    
    // Create viewport with current scale
    const viewport = page.getViewport({ scale: currentScale });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    // Set canvas dimensions
    const pixelRatio = window.devicePixelRatio || 1;
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    canvas.width = viewport.width * pixelRatio;
    canvas.height = viewport.height * pixelRatio;
    
    context.scale(pixelRatio, pixelRatio);
    
    const renderContext = {
        canvasContext: context,
        viewport: viewport,
        enableWebGL: true,
        renderInteractiveForms: true
    };

    // Clear previous content
    container.innerHTML = '';
    container.appendChild(canvas);

    // Render the page
    await page.render(renderContext);
    updateZoomLevel();
}

function updateZoomLevel() {
    document.getElementById('zoomLevel').textContent = `${Math.round(currentScale * 100)}%`;
}

function updatePageControls() {
    const prevButton = document.getElementById('prevPage');
    const nextButton = document.getElementById('nextPage');
    const currentPageSpan = document.getElementById('currentPage');
    const pageCountSpan = document.getElementById('pageCount');

    prevButton.disabled = currentPage <= 1;
    nextButton.disabled = currentPage >= pdfDoc.numPages;
    currentPageSpan.textContent = currentPage;
    pageCountSpan.textContent = pdfDoc.numPages;
}

async function getVisibleContent() {
    if (!pdfDoc) return '';

    // Get text content from current page
    const page = await pdfDoc.getPage(currentPage);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');

    // Also get text from previous and next pages for context
    let contextText = pageText;
    
    if (currentPage > 1) {
        const prevPage = await pdfDoc.getPage(currentPage - 1);
        const prevTextContent = await prevPage.getTextContent();
        contextText = prevTextContent.items.map(item => item.str).join(' ') + '\n\n' + contextText;
    }
    
    if (currentPage < pdfDoc.numPages) {
        const nextPage = await pdfDoc.getPage(currentPage + 1);
        const nextTextContent = await nextPage.getTextContent();
        contextText = contextText + '\n\n' + nextTextContent.items.map(item => item.str).join(' ');
    }

    return contextText;
}
