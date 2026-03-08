package com.example.ebookreader.controller;

import com.example.ebookreader.dto.EbookDto;
import com.example.ebookreader.service.EpubParserService;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@CrossOrigin(origins = "http://localhost:5173")
public class EbookController {

    private final EpubParserService epubParserService;

    public EbookController(EpubParserService epubParserService) {
        this.epubParserService = epubParserService;
    }

    @GetMapping("api/book/info")
    public EbookDto getBookInfo() {
        String filepath = "C:/Users/UTTARAN/Projects/ebookreader/ebookreader/test-books/Verne, Jules - Around the World in Eighty Days.epub";
        return epubParserService.parseEpub(filepath);
    }
}
