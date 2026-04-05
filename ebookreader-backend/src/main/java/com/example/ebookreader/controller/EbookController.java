package com.example.ebookreader.controller;

import com.example.ebookreader.dto.EbookDto;
import com.example.ebookreader.entity.Book;
import com.example.ebookreader.entity.Bookmark;
import com.example.ebookreader.service.EpubParserService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.HashMap;
import java.util.List;

@RestController
@CrossOrigin(origins = "http://localhost:5173")
public class EbookController {

    private static final Logger logger = LoggerFactory.getLogger(EbookController.class);

    private final EpubParserService epubParserService;

    public EbookController(EpubParserService epubParserService) {
        this.epubParserService = epubParserService;
    }

    @GetMapping("/api/book/info")
    public EbookDto getBookInfo(@RequestParam String bookId) {
        return epubParserService.parseEpub(bookId);
    }

    @GetMapping("/api/book/chapter")
    public String getChapter(@RequestParam String bookId, @RequestParam String chapterPath) {
        return epubParserService.getChapterContent(bookId, chapterPath);
    }

    @GetMapping("/api/book/asset")
    public ResponseEntity<byte[]> getBookAsset(@RequestParam String bookId, @RequestParam String assetPath) {
        byte[] data = epubParserService.getAsset(bookId, assetPath);
        if (data == null) return ResponseEntity.notFound().build();

        MediaType mediaType = MediaType.APPLICATION_OCTET_STREAM;
        String lowerPath = assetPath.toLowerCase();
        if (lowerPath.endsWith(".jpg") || lowerPath.endsWith(".jpeg")) mediaType = MediaType.IMAGE_JPEG;
        else if (lowerPath.endsWith(".png")) mediaType = MediaType.IMAGE_PNG;
        else if (lowerPath.endsWith(".css")) mediaType = MediaType.valueOf("text/css");
        return ResponseEntity.ok().contentType(mediaType).body(data);
    }

    @GetMapping("/api/books")
    public ResponseEntity<List<Book>> getAllBooks(){
        return ResponseEntity.ok(epubParserService.getAllBooks());
    }

    @GetMapping("/api/book/bookmarks")
    public ResponseEntity<List<Bookmark>> getBookmarks(@RequestParam String bookId){
        return ResponseEntity.ok(epubParserService.getBookmarks(bookId));
    }

    @PostMapping("/api/book/upload")
    public ResponseEntity<HashMap<String, String>> uploadBook(@RequestParam("file") MultipartFile file) {
        HashMap<String, String> response = new HashMap<>();
        try {
            String bookId = epubParserService.uploadBook(file);
            response.put("bookId", bookId);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            if(e.getMessage()!=null && e.getMessage().startsWith("DUPLICATE:")){
                logger.warn("Duplicate file rejected");
                response.put("error", e.getMessage().replace("DUPLICATE: ", ""));
                return ResponseEntity.status(409).body(response);
            }
            logger.error("Failed to upload book", e);
            response.put("error", "An unexpected error occurred while processing the EPUB.");
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/api/book/progress")
    public ResponseEntity<Void> updateProgress(
            @RequestParam String bookId,
            @RequestParam int chapterIndex,
            @RequestParam double progress){
        epubParserService.updateLastReadPosition(bookId,chapterIndex,progress);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/api/book/bookmark")
    public ResponseEntity<Void> addBookmark(
            @RequestParam String bookId,
            @RequestParam String name,
            @RequestParam(required = false) String note,
            @RequestParam int chapterIndex,
            @RequestParam String chapterTitle,
            @RequestParam double progress){
        epubParserService.saveBookmark(bookId,name,note, chapterIndex, chapterTitle, progress);
        return ResponseEntity.ok().build();
    }
}
